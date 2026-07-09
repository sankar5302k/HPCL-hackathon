import math
import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load env variables from backend/.env explicitly
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate distance in kilometers.
    """
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    return c * 6371.0

def build_dataset_context(outlets, qa_reports):
    """
    Builds a compact context string representing the Bhopal Zone outlets and 
    summarized QA reports to serve as the chatbot's memory.
    """
    # 1. Summarize Outlets (165 records)
    outlets_summary = []
    for o in outlets:
        is_never = "NEVER_INSPECTED" if o.get('Outlets Never Inspected') else "ACTIVE"
        gap = f"{o['Inspection Gap (Years)']} yrs gap" if o.get('Inspection Gap (Years)') else "no gap info"
        outlets_summary.append(
            f"ID:{o['Customer Number']}|Name:{o['Customer Name']}|District:{o['District']}|Coords:({o['LAT']},{o['LON']})|RO:{o['Regional Office']}|SA:{o['Sales Area']}|Status:{is_never}|Gap:{gap}|LastInspected:{o['Last Inspection Date']}"
        )
    
    # 2. Summarize QA reports (Bhopal/Jabalpur RO specifically, to keep prompt compact and relevant)
    bhopal_qa = [r for r in qa_reports if r.get('Regional Office') in ['BHOPAL RET RO', 'JABALPUR RET RO']]
    qa_summary = []
    # Take first 40 QA issues or summarize key issues
    for r in bhopal_qa[:45]:
        qa_summary.append(
            f"OutletID:{r['Outlet ID']}|Name:{r['Outlet Name']}|Month:{r['Inspection Month']}|Sev:{r['Severity']}|Obs:{r['Observation'][:80]}|ATR:{r['ATR'][:80]}|Compliance:{r['Current Compliance']}|Penalty:₹{r['Penality']}"
        )
        
    return {
        "outlets_text": "\n".join(outlets_summary),
        "qa_text": "\n".join(qa_summary),
        "bhopal_qa_count": len(bhopal_qa),
        "total_qa_count": len(qa_reports)
    }

def get_gemini_chatbot_response(messages, outlets, qa_reports):
    """
    Calls the Gemini API to respond as an intelligent route planner and QA analyst.
    Integrates the Bhopal dataset context directly into the system prompt.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    is_placeholder = not api_key or any(p in api_key.upper() for p in ["YOUR_API_KEY", "PLACEHOLDER", "INSERT_KEY"])
    
    fallback_response = (
        "### Bhopal Zone Inspection Route Plan (Fallback Demo Mode)\n\n"
        "**Notice:** Gemini API Key is missing or invalid. Providing a pre-defined optimized inspection route for Bhopal Zone.\n\n"
        "Here is a curated 5-stop high-priority inspection route targeting never-inspected and long-gap outlets in Bhopal:\n\n"
        "1. **HSD UNITED SALES AND SERVICE** (Customer ID: 41000049) - Starting point, high-volume outlet.\n"
        "2. **M/S K.R.PARMAR FUEL STATION** (Customer ID: 41032460) - Priority inspection.\n"
        "3. **MSHSD B.S.S FILLING STATION,CHOLA R** (Customer ID: 41043762) - Safety compliance audit required.\n"
        "4. **M/S SHEEBA PETROL PUMP ,KAZICAMP** (Customer ID: 41048643) - Forecourt inspection.\n"
        "5. **M/S SHRI GANESH SERVICE STATION** (Customer ID: 41049450) - Final leg stop.\n\n"
        "```json\n"
        "{\n"
        "  \"type\": \"route_plan\",\n"
        "  \"route\": [41000049, 41032460, 41043762, 41048643, 41049450]\n"
        "}\n"
        "```"
    )

    if is_placeholder:
        return fallback_response

    # Compile the dataset memory context
    context = build_dataset_context(outlets, qa_reports)
    
    system_instruction = f"""You are the HPCL RouteGuard AI Chatbot Assistant for the Bhopal Zone, designed by the Google DeepMind team.
You have complete memory of the Bhopal Zone outlets (165 outlets) and QA inspection reports.

Memory Context - Bhopal Zone Outlets:
{context['outlets_text']}

Memory Context - QA Observation Reports (Sample and Bhopal-related, total {context['bhopal_qa_count']} in Bhopal, {context['total_qa_count']} nationwide):
{context['qa_text']}

Your capabilities:
1. **Interactive Route Planning**: Recommend the best sequence of outlets to inspect based on their coordinates, districts, inspection gaps, or never-inspected status.
2. **QA Analysis**: Answer queries about QA violations, severity, penalties, compliance rates, or pending ATR actions in the Bhopal zone.
3. **Geographical Reasoning**: Suggest sensible, ordered visits to minimize travel time and distance.

Guidelines:
- When planning a route, explain your reasoning clearly.
- CRITICAL: When you propose or plan a route, you MUST output a JSON block at the very end of your response in EXACTLY this format with NO deviations:
```json
{{
  "type": "route_plan",
  "route": [41000049, 41043762, 41049450]
}}
```
- The numbers in the "route" array MUST be the exact Customer Numbers (the ID field, labeled "ID:" in the memory context above). DO NOT use outlet names. DO NOT make up IDs. ONLY use Customer Numbers that appear in the Memory Context above.
- ALWAYS include this JSON block when you have planned or proposed any route — even partial ones.
- The frontend will parse this JSON block to draw the route on the map.
- Keep your tone professional, helpful, and concise. Start answering directly without filler phrases.
"""

    # Construct request payload
    gemini_messages = []
    
    # Format the prompt messages
    # Gemini expectation: list of objects with 'role' ('user' or 'model') and 'parts' [ { 'text': '...' } ]
    for msg in messages:
        role = 'user' if msg['role'] == 'user' else 'model'
        gemini_messages.append({
            "role": role,
            "parts": [{"text": msg['content']}]
        })

    # Prepare request
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": gemini_messages,
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=60)
        if response.status_code == 200:
            result = response.json()
            return result['candidates'][0]['content']['parts'][0]['text']
        else:
            # If there's an API error (e.g. key expired or blocked), fallback to predefined route plan
            return fallback_response
    except Exception as e:
        return fallback_response
