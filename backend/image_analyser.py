import os
import re
import base64
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# ─── System Prompt ─────────────────────────────────────────────────────────────
# IMPORTANT: No markdown in this prompt — only HTML examples so Gemini mirrors the format
INSPECTION_SYSTEM_PROMPT = """You are an expert HPCL petroleum outlet infrastructure inspector with 20 years of field experience.

You will receive a photograph of a petroleum outlet (petrol station / fuel dispensing facility) and you must produce a COMPLETE, DETAILED inspection report.

CRITICAL FORMATTING RULE: Your ENTIRE response must be valid HTML only. Do NOT use markdown. Do NOT use asterisks. Do NOT use backticks. Do NOT use code fences. Output raw HTML starting with <div and ending with </div>.

Analyse every visible element in the image for:
- Pipeline infrastructure (pipes, joints, flanges, valves, visible corrosion or leaks)
- Dispensing units (dispensers, nozzles, hose condition, display panels)
- Storage and tank area (tank vents, fill covers, bunds, spill containment)
- Electrical and safety systems (earthing, fire extinguishers, signage, emergency stops)
- Housekeeping and civil works (cleanliness, drainage, forecourt, canopy)
- Statutory compliance (licence boards, safety signs, markings)

Output this EXACT HTML structure with real findings filled in (replace all [PLACEHOLDERS]):

<div style="font-family: Segoe UI, Arial, sans-serif; color: #111827;">

  <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; padding: 24px 28px; border-radius: 10px 10px 0 0; margin-bottom: 0;">
    <div style="font-size: 20px; font-weight: 800; margin: 0;">HPCL Petroleum Outlet — Visual Inspection Report</div>
    <div style="font-size: 12px; opacity: 0.85; margin-top: 6px;">AI-Powered Infrastructure Analysis | Optimized Route Planner</div>
  </div>

  <div style="background: [USE #16a34a for SATISFACTORY, #d97706 for NEEDS ATTENTION, #dc2626 for CRITICAL]; padding: 14px 28px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
    <div style="font-size: 28px;">[USE checkmark or warning or cross symbol here]</div>
    <div>
      <div style="font-weight: 700; font-size: 15px; color: white;">Overall Status: [SATISFACTORY / NEEDS ATTENTION / CRITICAL]</div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.9); margin-top: 3px;">[Write a single sentence summary of what you found overall]</div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Pipeline Infrastructure</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>[Finding 1 about pipes/valves visible in image]</li>
        <li>[Finding 2]</li>
        <li>[Finding 3 or 'Not visible in this image']</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: [#dcfce7 for OK, #fef9c3 for MINOR, #fee2e2 for MAJOR]; color: [#15803d or #a16207 or #b91c1c]; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">[OK / MINOR ISSUE / MAJOR ISSUE]</span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Dispensing Units</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>[Finding about dispensers visible]</li>
        <li>[Finding 2]</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">OK</span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Safety Systems</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>[Finding about fire extinguisher / earthing / signage]</li>
        <li>[Finding 2]</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">OK</span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Housekeeping & Civil Works</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>[Finding about cleanliness, drainage, forecourt]</li>
        <li>[Finding 2]</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">OK</span>
      </div>
    </div>

  </div>

  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
    <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detailed Observations Table</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr style="background: #1e40af; color: white;">
          <th style="padding: 9px 12px; text-align: left; border-radius: 0;">Category</th>
          <th style="padding: 9px 12px; text-align: left;">Finding</th>
          <th style="padding: 9px 12px; text-align: center;">Severity</th>
          <th style="padding: 9px 12px; text-align: left;">Recommended Action</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: white; border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 8px 12px; color: #374151;">[Category e.g. Pipeline]</td>
          <td style="padding: 8px 12px; color: #374151;">[Specific finding from image]</td>
          <td style="padding: 8px 12px; text-align: center;"><span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">Minor</span></td>
          <td style="padding: 8px 12px; color: #374151;">[Action to take]</td>
        </tr>
        <tr style="background: #f9fafb; border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 8px 12px; color: #374151;">[Category]</td>
          <td style="padding: 8px 12px; color: #374151;">[Finding]</td>
          <td style="padding: 8px 12px; text-align: center;"><span style="background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">Major</span></td>
          <td style="padding: 8px 12px; color: #374151;">[Action]</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
    <div style="font-weight: 700; font-size: 13px; color: #c2410c; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Priority Action Items</div>
    <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #374151; line-height: 1.8;">
      <li>[Immediate action 1 required based on findings]</li>
      <li>[Action 2]</li>
      <li>[Action 3 or 'No immediate actions required if satisfactory']</li>
    </ol>
  </div>

  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 11px; color: #1e40af;">
    This report was generated by AI visual analysis. Field verification by a qualified HPCL inspector is mandatory before any compliance action.
  </div>

</div>

Fill in ALL placeholder text [in brackets] with your real observations from the image. If a section is not visible in the image, state "Not visible in this photograph." Be specific and detailed about what you actually see."""


def _strip_fences(text: str) -> str:
    """Remove markdown code fences (```html, ```HTML, ``` etc.) from Gemini output."""
    text = text.strip()
    # Remove opening fence: ```html or ```HTML or ``` or ```xml etc.
    text = re.sub(r'^```[a-zA-Z]*\s*', '', text, flags=re.MULTILINE)
    # Remove closing fence
    text = re.sub(r'```\s*$', '', text, flags=re.MULTILINE)
    return text.strip()


FALLBACK_HTML_REPORT = """<div style="font-family: Segoe UI, Arial, sans-serif; color: #111827;">

  <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); color: white; padding: 24px 28px; border-radius: 10px 10px 0 0; margin-bottom: 0;">
    <div style="font-size: 20px; font-weight: 800; margin: 0;">HPCL Petroleum Outlet — Visual Inspection Report (Fallback Demo)</div>
    <div style="font-size: 12px; opacity: 0.85; margin-top: 6px;">AI-Powered Infrastructure Analysis | Offline Demo Mode</div>
  </div>

  <div style="background: #d97706; padding: 14px 28px; display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
    <div style="font-size: 28px;">⚠</div>
    <div>
      <div style="font-weight: 700; font-size: 15px; color: white;">Overall Status: NEEDS ATTENTION (Fallback Demo)</div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.9); margin-top: 3px;">The API key is missing or invalid. Displaying a predefined inspection report for demonstration purposes. Minor issues detected on forecourt area.</div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Pipeline Infrastructure</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>All visible pipes show standard green anti-corrosion coating.</li>
        <li>Flanges and joints are securely bolted with no visible signs of product weeping or leakage.</li>
        <li>Pressure gauges read within operational ranges.</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">OK</span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Dispensing Units</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>Dispenser housings are clean and intact with clear digital displays.</li>
        <li>Delivery hose shows minor scuffing near the nozzle junction (requires monitoring).</li>
        <li>Emergency shear valves are correctly positioned.</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #fef9c3; color: #a16207; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">MINOR ISSUE</span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Safety Systems</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>Fire extinguishers are mounted in designated areas with inspection tags valid.</li>
        <li>Earthing connections are verified and paint-coded.</li>
        <li>Mandatory safety signage is clearly visible on the canopy columns.</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #dcfce7; color: #15803d; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">OK</span>
      </div>
    </div>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Housekeeping & Civil Works</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.7;">
        <li>Forecourt is clear of debris; however, minor oil staining is visible near dispensing bay 2.</li>
        <li>Canopy structure is in good condition; drainage channels are clear of obstruction.</li>
      </ul>
      <div style="margin-top: 10px;">
        <span style="background: #fef9c3; color: #a16207; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">MINOR ISSUE</span>
      </div>
    </div>

  </div>

  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
    <div style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detailed Observations Table</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr style="background: #1e40af; color: white;">
          <th style="padding: 9px 12px; text-align: left; border-radius: 0;">Category</th>
          <th style="padding: 9px 12px; text-align: left;">Finding</th>
          <th style="padding: 9px 12px; text-align: center;">Severity</th>
          <th style="padding: 9px 12px; text-align: left;">Recommended Action</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: white; border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 8px 12px; color: #374151;">Dispensing Units</td>
          <td style="padding: 8px 12px; color: #374151;">Minor wear/scuffing on product delivery hoses.</td>
          <td style="padding: 8px 12px; text-align: center;"><span style="background: #fef9c3; color: #a16207; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">Minor</span></td>
          <td style="padding: 8px 12px; color: #374151;">Schedule standard replacement during next regular maintenance cycle.</td>
        </tr>
        <tr style="background: #f9fafb; border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 8px 12px; color: #374151;">Housekeeping</td>
          <td style="padding: 8px 12px; color: #374151;">Oil stains present on concrete forecourt near Dispenser 2.</td>
          <td style="padding: 8px 12px; text-align: center;"><span style="background: #fef9c3; color: #a16207; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">Minor</span></td>
          <td style="padding: 8px 12px; color: #374151;">Apply dry absorbent powder and wash forecourt.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
    <div style="font-weight: 700; font-size: 13px; color: #c2410c; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Priority Action Items</div>
    <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #374151; line-height: 1.8;">
      <li>Clean forecourt oil stains to prevent slips/fire hazards.</li>
      <li>Replace wear-damaged delivery hoses on Dispenser 2.</li>
    </ol>
  </div>

  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 11px; color: #1e40af;">
    This report was generated in offline mode due to an API Key configuration error. Field verification by a qualified HPCL inspector is mandatory.
  </div>

</div>
"""


def analyse_outlet_image(image_bytes: bytes, mime_type: str) -> str:
    """
    Sends an outlet image to Gemini Vision and returns an HTML inspection report.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    is_placeholder = not api_key or any(p in api_key.upper() for p in ["YOUR_API_KEY", "PLACEHOLDER", "INSERT_KEY"])
    if is_placeholder:
        return FALLBACK_HTML_REPORT

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": image_b64
                        }
                    },
                    {
                        "text": (
                            "Analyse this petroleum outlet image thoroughly. "
                            "Produce the complete HTML inspection report exactly as instructed. "
                            "Start your response with <div and end with </div>. "
                            "Do not write anything before <div or after </div>."
                        )
                    }
                ]
            }
        ],
        "systemInstruction": {
            "parts": [{"text": INSPECTION_SYSTEM_PROMPT}]
        },
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 6000
        }
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=90
        )
        if response.status_code == 200:
            result = response.json()

            # Extract text from response
            candidates = result.get("candidates", [])
            if not candidates:
                return "<p style='color:red;'>Gemini returned no candidates. The image may have been blocked by safety filters.</p>"

            raw = candidates[0]["content"]["parts"][0]["text"]

            # Strip any markdown fences Gemini may have added
            html = _strip_fences(raw)

            # If Gemini still returned markdown (doesn't start with <), wrap it
            if not html.lstrip().startswith("<"):
                # Convert basic markdown bold to <strong>
                html = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html)
                html = f"""<div style="font-family: Segoe UI, Arial, sans-serif; color: #111827; padding: 20px;">
  <div style="background: linear-gradient(135deg,#1e3a8a,#2563eb);color:white;padding:20px;border-radius:8px;margin-bottom:16px;">
    <div style="font-size:18px;font-weight:800;">HPCL Petroleum Outlet — Visual Inspection Report</div>
  </div>
  <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.7; color: #374151;">{html}</div>
</div>"""

            return html

        else:
            return FALLBACK_HTML_REPORT

    except Exception as e:
        return FALLBACK_HTML_REPORT
