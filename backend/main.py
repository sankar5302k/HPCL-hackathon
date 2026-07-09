import os
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.data_loader import load_outlets, load_qa_reports
from backend.route_planner import get_gemini_chatbot_response
from backend.image_analyser import analyse_outlet_image

# Load env variables from backend/.env explicitly
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

app = FastAPI(
    title="HPCL RouteGuard Gemini Chatbot & QA Dashboard API",
    description="Backend API powered by Gemini for interactive route planning and quality assurance analytics.",
    version="2.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Cache
_outlets_cache = None
_qa_reports_cache = None

def get_outlets():
    global _outlets_cache
    if _outlets_cache is None:
        try:
            _outlets_cache = load_outlets()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load outlets data: {str(e)}")
    return _outlets_cache

def get_qa_reports():
    global _qa_reports_cache
    if _qa_reports_cache is None:
        try:
            _qa_reports_cache = load_qa_reports()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load QA reports data: {str(e)}")
    return _qa_reports_cache

# Request Models
class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# Root Endpoint
@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "HPCL RouteGuard Gemini API is running."
    }

# Outlets Endpoints
@app.get("/api/outlets")
def get_all_outlets(district: Optional[str] = None):
    outlets = get_outlets()
    if district:
        dist_upper = district.upper().strip()
        outlets = [o for o in outlets if o['District'] == dist_upper]
    return outlets

@app.get("/api/districts")
def get_unique_districts():
    outlets = get_outlets()
    districts = sorted(list(set(o['District'] for o in outlets if o.get('District'))))
    return districts

# QA Reports Endpoints
@app.get("/api/qa-reports/stats")
def get_qa_stats(regional_office: Optional[str] = None):
    reports = get_qa_reports()
    
    if regional_office:
        reports = [r for r in reports if r['Regional Office'] == regional_office]
        
    total = len(reports)
    if total == 0:
        return {
            "total_reports": 0,
            "severity_counts": {},
            "compliance_counts": {"original": {}, "current": {}},
            "total_penalties": 0.0,
            "remedial_actions_pending": 0,
            "regional_distribution": {},
            "compliance_rate": 0.0
        }
        
    severity_counts = {}
    orig_comp = {}
    curr_comp = {}
    total_penalties = 0.0
    pending_atr = 0
    regional_dist = {}
    sales_area_dist = {}
    
    for r in reports:
        # Severity count
        sev = str(r.get('Severity', 'Others')).strip()
        if not sev or sev == 'nan':
            sev = 'Others'
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
        
        # Compliance count
        oc = str(r.get('Original Compilance', 'NC')).strip()
        if not oc or oc == 'nan':
            oc = 'NC'
        orig_comp[oc] = orig_comp.get(oc, 0) + 1
        
        cc = str(r.get('Current Compliance', 'NC')).strip()
        if not cc or cc == 'nan':
            cc = 'NC'
        curr_comp[cc] = curr_comp.get(cc, 0) + 1
        
        # Penalty
        penalty_val = r.get('Penality')
        try:
            total_penalties += float(penalty_val) if penalty_val and str(penalty_val) != 'nan' else 0.0
        except ValueError:
            pass
        
        # Pending remedial actions (where Current Compliance is still NC or ATR is empty)
        is_pending_atr = (cc == 'NC' or not r.get('ATR') or str(r.get('ATR')).strip() == 'nan')
        if is_pending_atr:
            pending_atr += 1
            
        # Regional office distribution
        ro = str(r.get('Regional Office', 'Unknown')).strip()
        if not ro or ro == 'nan':
            ro = 'Unknown'
        regional_dist[ro] = regional_dist.get(ro, 0) + 1
        
        # Sales area distribution
        sa = str(r.get('Sales Area', 'Unknown')).strip()
        if not sa or sa == 'nan':
            sa = 'Unknown'
        sales_area_dist[sa] = sales_area_dist.get(sa, 0) + 1
        
    compliant_count = curr_comp.get('C', 0) + curr_comp.get('Compliant', 0)
    compliance_rate = round((compliant_count / total) * 100, 2) if total > 0 else 0.0
    
    return {
        "total_reports": total,
        "severity_counts": severity_counts,
        "compliance_counts": {
            "original": orig_comp,
            "current": curr_comp
        },
        "total_penalties": round(total_penalties, 2),
        "remedial_actions_pending": pending_atr,
        "regional_distribution": regional_dist,
        "sales_area_distribution": sales_area_dist,
        "compliance_rate": compliance_rate
    }

@app.get("/api/qa-reports")
def get_all_qa_reports(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    severity: Optional[str] = None,
    compliance: Optional[str] = None,
    regional_office: Optional[str] = None
):
    reports = get_qa_reports()
    
    if regional_office:
        reports = [r for r in reports if r['Regional Office'] == regional_office]
        
    if severity:
        reports = [r for r in reports if r['Severity'] == severity]
        
    if compliance:
        reports = [r for r in reports if r['Current Compliance'] == compliance]
        
    if search:
        search_lower = search.lower().strip()
        reports = [
            r for r in reports 
            if search_lower in r['Outlet Name'].lower() or 
               search_lower in r['Observation'].lower() or 
               search_lower in str(r['Outlet ID']) or
               search_lower in r['ATR'].lower() or
               search_lower in r['Remark'].lower()
        ]
        
    total = len(reports)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_reports = reports[start_idx:end_idx]
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
        "data": paginated_reports
    }

@app.get("/api/qa-reports/regional-offices")
def get_qa_regional_offices():
    reports = get_qa_reports()
    offices = sorted(list(set(r['Regional Office'] for r in reports if r.get('Regional Office'))))
    return offices

# AI Chat Endpoint
@app.post("/api/chat")
def post_chat_interaction(req: ChatRequest):
    outlets = get_outlets()
    qa_reports = get_qa_reports()
    
    # Process history
    history_messages = [msg.dict() for msg in req.messages]
    
    # Call Gemini Client
    response_text = get_gemini_chatbot_response(
        messages=history_messages,
        outlets=outlets,
        qa_reports=qa_reports
    )
    
    return {
        "response": response_text
    }


# Smart Inspection Analyser Endpoint
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

@app.post("/api/analyse-image")
async def analyse_image(file: UploadFile = File(...)):
    """
    Accepts an image upload of a petroleum outlet and returns an
    HTML-formatted inspection report generated by Gemini Vision.
    """
    mime = file.content_type or "image/jpeg"
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{mime}'. Allowed: JPEG, PNG, WEBP, HEIC."
        )

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=413, detail="Image too large. Maximum size is 10 MB.")

    html_report = analyse_outlet_image(image_bytes, mime)
    return {"report": html_report}
