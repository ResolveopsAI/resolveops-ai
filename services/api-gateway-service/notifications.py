import boto3
import os
import json
import smtplib
import logging
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

DASHBOARD_URL = "https://resolveops-ai.sathvikdevops.online"

# ─── SMTP Configuration ──────────────────────────────────────────────────────
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com").strip().strip('"').strip("'")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip().strip('"').strip("'")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "").strip().strip('"').strip("'")

SENDER_EMAIL = (
    os.getenv("EMAIL_FROM") or
    os.getenv("SMTP_FROM_EMAIL") or
    os.getenv("SENDER_EMAIL") or
    os.getenv("RESOLVEOPS_SENDER_EMAIL") or
    os.getenv("NEXUS_SENDER_EMAIL") or
    SMTP_USER
).strip().strip('"').strip("'")

logger.info("=== SMTP Configuration ===")
logger.info(f"SMTP Host loaded: {SMTP_HOST}")
logger.info(f"SMTP Port loaded: {SMTP_PORT}")
logger.info(f"SMTP Username loaded: {SMTP_USER}")
logger.info(f"Sender Email loaded: {SENDER_EMAIL}")
logger.info(f"SMTP Password present: {bool(SMTP_PASSWORD)}")
logger.info("==========================")

def _send_smtp(recipient: str, subject: str, html_body: str) -> bool:
    """Send an email via SMTP (Gmail / any SMTP provider) with retry logic."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning(f"SMTP not configured. MOCK EMAIL to {recipient}: {subject}")
        try:
            with open("local_emails_mock.json", "a") as f:
                f.write(json.dumps({"to": recipient, "subject": subject}) + "\n")
        except Exception:
            pass
        return True

    retries = 3
    while retries > 0:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"ResolveOps Support <{SENDER_EMAIL}>"
            msg["To"] = recipient
            msg.attach(MIMEText(html_body, "html"))

            # Auto-detect security: Port 465 is typically SSL, 587 is STARTTLS
            if SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)
                server.ehlo()
            else:
                server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
                server.ehlo()
                server.starttls()
                server.ehlo()

            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SENDER_EMAIL, [recipient], msg.as_string())
            server.quit()

            logger.info(f"SMTP email sent to {recipient}: {subject}")
            return True
        except Exception as e:
            retries -= 1
            logger.warning(f"SMTP attempt failed ({3 - retries}/3): {e}")
            time.sleep(2)
            if retries == 0:
                logger.error(f"SMTP send failed after retries: {e}")
    return False


def _html_wrapper(title: str, body_html: str) -> str:
    """Wraps content in a premium, on-brand ResolveOps AI email template."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 40px auto; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }}
        .header {{ background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 32px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 24px; color: #ffffff; letter-spacing: -0.5px; }}
        .header p {{ margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.7); }}
        .body {{ padding: 32px; }}
        .body h2 {{ color: #f1f5f9; font-size: 20px; margin-top: 0; }}
        .body p {{ color: #94a3b8; line-height: 1.6; }}
        .card {{ background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 20px; margin: 20px 0; }}
        .badge-critical {{ display: inline-block; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }}
        .badge-warning {{ display: inline-block; background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }}
        .otp-box {{ background: #0f172a; border: 2px solid #4f46e5; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }}
        .otp-code {{ font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #a5b4fc; font-family: monospace; }}
        .btn {{ display: inline-block; background: linear-gradient(135deg, #4f46e5, #6366f1); color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 16px; }}
        .footer {{ background: #0f172a; padding: 20px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); }}
        .footer p {{ color: #475569; font-size: 12px; margin: 0; }}
        pre {{ background: #020617; color: #94a3b8; padding: 16px; border-radius: 8px; font-size: 13px; overflow-x: auto; border-left: 3px solid #4f46e5; white-space: pre-wrap; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⬡ ResolveOps AI</h1>
          <p>Autonomous SRE & Incident Intelligence Platform</p>
        </div>
        <div class="body">
          <h2>{title}</h2>
          {body_html}
        </div>
        <div class="footer">
          <p>ResolveOps AI · <a href="{DASHBOARD_URL}" style="color:#6366f1;">resolveops-ai.sathvikdevops.online</a> · This is an automated notification.</p>
        </div>
      </div>
    </body>
    </html>
    """


# ─── Public Notification Functions ───────────────────────────────────────────

def send_otp_email(email: str, full_name: str, otp_code: str) -> bool:
    """Sends a 6-digit OTP verification code to the user's email."""
    first_name = full_name.split()[0] if full_name else "there"
    body = f"""
        <p>Hi <strong>{first_name}</strong>,</p>
        <p>Welcome to <strong>ResolveOps AI</strong>! To verify your email address and activate your account, please enter the OTP below:</p>
        <div class="otp-box">
          <div class="otp-code">{otp_code}</div>
          <p style="color:#64748b; font-size:13px; margin-top:12px;">This code expires in <strong>2 minutes</strong>.</p>
        </div>
        <p style="color:#64748b; font-size:13px;">If you did not request this, please ignore this email.</p>
    """
    return _send_smtp(email, "Your ResolveOps AI Verification Code", _html_wrapper("Email Verification", body))


def notify_incident_created(tenant_email: str, incident_id: str, service: str, severity: str, full_name: str = "") -> bool:
    """Sends a real-time incident alert email the moment an error is detected."""
    first_name = full_name.split()[0] if full_name else "Engineer"
    badge_class = "badge-critical" if severity in ("CRITICAL", "FATAL", "ERROR") else "badge-warning"
    body = f"""
        <p>Hi <strong>{first_name}</strong>,</p>
        <p>A new infrastructure anomaly has been detected and automatically registered as an incident in your ResolveOps AI dashboard.</p>
        <div class="card">
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px;">Incident ID</td><td style="color:#f1f5f9; font-weight:600; font-size:13px;">{incident_id}</td></tr>
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px;">Affected Service</td><td style="color:#f1f5f9; font-weight:600; font-size:13px;">{service}</td></tr>
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px;">Severity</td><td><span class="{badge_class}">{severity}</span></td></tr>
          </table>
        </div>
        <p>The ResolveOps AI RAG engine is now analyzing your logs to generate a Root Cause Analysis. You will receive the full report in a follow-up email.</p>
        <a href="{DASHBOARD_URL}" class="btn">View Incident Dashboard →</a>
    """
    subject = f"[{severity}] ResolveOps AI Alert: {incident_id} on {service}"
    return _send_smtp(tenant_email, subject, _html_wrapper(f"New {severity} Incident Detected", body))


def notify_rca_completed(tenant_email: str, incident_id: str, service: str, rca_report: str, full_name: str = "") -> bool:
    """Sends the full AI-generated RCA report to the user's inbox."""
    first_name = full_name.split()[0] if full_name else "Engineer"
    formatted_rca = rca_report.replace("\n", "<br>")
    body = f"""
        <p>Hi <strong>{first_name}</strong>,</p>
        <p>The ResolveOps AI RCA engine has completed its analysis for incident <strong>{incident_id}</strong> on <strong>{service}</strong>.</p>
        <div class="card">
          <pre>{formatted_rca}</pre>
        </div>
        <a href="{DASHBOARD_URL}" class="btn">View Full Report →</a>
    """
    subject = f"ResolveOps AI RCA Complete: {incident_id} ({service})"
    return _send_smtp(tenant_email, subject, _html_wrapper("Root Cause Analysis Ready", body))


def notify_predictive_alert(
    tenant_email: str,
    service: str,
    failure_type: str,
    risk_score: float,
    confidence_score: float,
    probable_cause: str,
    suggested_remediation: str,
    deployment_context: dict = None,
    full_name: str = ""
) -> bool:
    """Sends a premium, proactive warning email before a failure occurs."""
    first_name = full_name.split()[0] if full_name else "Engineer"
    
    # Render deployment context if present
    deploy_html = ""
    if deployment_context:
        deploy_html = f"""
        <h3 style="color:#f1f5f9; font-size:14px; margin-top:20px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom:6px;">Correlated Deployment Event</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
          <tr><td style="color:#64748b; padding: 4px 0; font-size:13px; width:120px;">Repository</td><td style="color:#f1f5f9; font-size:13px;">{deployment_context.get('repository')}</td></tr>
          <tr><td style="color:#64748b; padding: 4px 0; font-size:13px;">Author</td><td style="color:#f1f5f9; font-size:13px;">{deployment_context.get('author')}</td></tr>
          <tr><td style="color:#64748b; padding: 4px 0; font-size:13px;">Commit Msg</td><td style="color:#a5b4fc; font-size:13px;">{deployment_context.get('commit_msg')}</td></tr>
          <tr><td style="color:#64748b; padding: 4px 0; font-size:13px;">Commit SHA</td><td style="color:#f1f5f9; font-family:monospace; font-size:12px;">{deployment_context.get('commit_sha')[:7]}</td></tr>
        </table>
        """

    body = f"""
        <p>Hi <strong>{first_name}</strong>,</p>
        <p style="color:#f43f5e; font-weight:600; font-size:15px;">⚠️ Proactive Alert: Impending Outage Predicted</p>
        <p>ResolveOps AI has detected anomalous log patterns suggesting a potential failure in your service. Operational stats indicate an elevated risk profile.</p>
        
        <div class="card">
          <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px; width:140px;">Affected Service</td><td style="color:#f1f5f9; font-weight:600; font-size:13px;">{service}</td></tr>
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px;">Predicted Failure</td><td style="color:#f87171; font-weight:600; font-size:13px;">{failure_type}</td></tr>
            <tr>
              <td style="color:#64748b; padding: 6px 0; font-size:13px;">Risk Score</td>
              <td><span class="badge-critical" style="background:rgba(244,63,94,0.15); color:#f43f5e; border-color:rgba(244,63,94,0.25);">{risk_score}% Risk</span></td>
            </tr>
            <tr>
              <td style="color:#64748b; padding: 6px 0; font-size:13px;">Confidence Score</td>
              <td><span class="badge-warning" style="background:rgba(245,158,11,0.15); color:#fbbf24; border-color:rgba(245,158,11,0.25);">{confidence_score}% Confidence</span></td>
            </tr>
          </table>
        </div>

        <div class="card" style="background:#0f172a; border-left:4px solid #f59e0b;">
          <h4 style="margin:0 0 8px 0; color:#fbbf24; font-size:14px;">AI-Assisted Predictive RCA</h4>
          <p style="margin:0; font-size:13px; color:#e2e8f0; line-height:1.5;">{probable_cause}</p>
        </div>

        {deploy_html}

        <h3 style="color:#f1f5f9; font-size:14px; margin-top:20px;">Suggested Remediation Steps</h3>
        <pre>{suggested_remediation}</pre>

        <a href="{DASHBOARD_URL}" class="btn" style="background:linear-gradient(135deg, #f59e0b, #d97706);">Mitigate Threat Now →</a>
    """
    subject = f"[PREDICTIVE ALERT] Impending failure forecasted for {service}"
    return _send_smtp(tenant_email, subject, _html_wrapper("Proactive Incident Prevention Alert", body))

def notify_pipeline_failure(
    tenant_email: str,
    repository: str,
    job_name: str,
    raw_logs: str,
    ai_diagnosis: str,
    full_name: str = ""
) -> bool:
    """Sends a detailed email containing the AI's diagnosis of a failed pipeline."""
    first_name = full_name.split()[0] if full_name else "Engineer"
    
    # Format the AI diagnosis to handle line breaks gracefully in HTML
    formatted_diagnosis = ai_diagnosis.replace("\n", "<br>")
    
    body = f"""
        <p>Hi <strong>{first_name}</strong>,</p>
        <p style="color:#f43f5e; font-weight:600; font-size:15px;">❌ Pipeline Execution Failed</p>
        <p>ResolveOps AI has detected a failure in your CI/CD pipeline and has automatically diagnosed the root cause.</p>
        
        <div class="card">
          <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px; width:140px;">Repository</td><td style="color:#f1f5f9; font-weight:600; font-size:13px;">{repository}</td></tr>
            <tr><td style="color:#64748b; padding: 6px 0; font-size:13px;">Failed Job</td><td style="color:#f87171; font-weight:600; font-size:13px;">{job_name}</td></tr>
          </table>
        </div>

        <div class="card" style="background:#0f172a; border-left:4px solid #6366f1;">
          <h4 style="margin:0 0 8px 0; color:#818cf8; font-size:14px;">🤖 ResolveOps AI Root Cause & Prediction</h4>
          <p style="margin:0; font-size:13px; color:#e2e8f0; line-height:1.5;">{formatted_diagnosis}</p>
        </div>

        <h3 style="color:#f1f5f9; font-size:14px; margin-top:20px;">Raw Log Snippet</h3>
        <pre>{raw_logs}</pre>

        <a href="{DASHBOARD_URL}/github" class="btn">View Dashboard →</a>
    """
    subject = f"[Failed] Pipeline Error Detected in {repository}"
    return _send_smtp(tenant_email, subject, _html_wrapper("Automated Pipeline Diagnosis", body))


def notify_self_healing_action(
    tenant_email: str,
    service: str,
    failure_type: str,
    risk_score: float,
    confidence_score: float,
    action_taken: str,
    status: str,
    result_message: str,
    full_name: str = "",
) -> bool:
    """Send a notification email when the self-healing engine fires."""

    # Status colour and label
    if status == "success":
        status_color = "#10b981"
        status_label = "✅ Auto-Healed Successfully"
        border_color = "#10b981"
    elif status == "simulated":
        status_color = "#f59e0b"
        status_label = "⚙️ Simulated (No Credentials)"
        border_color = "#f59e0b"
    else:
        status_color = "#ef4444"
        status_label = "❌ Healing Action Failed"
        border_color = "#ef4444"

    action_label = action_taken.replace("_", " ").title()
    greeting = f"Hello {full_name}," if full_name else "Hello,"

    body = f"""
        <p style="font-size:15px; color:#e2e8f0;">{greeting}</p>
        <p style="font-size:14px; color:#94a3b8; margin-bottom:20px;">
          ResolveOps AI's Self-Healing Engine detected an anomaly and automatically attempted remediation.
          Here's a summary of what happened:
        </p>

        <div style="background:#0f172a; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:20px; margin-bottom:20px;">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <div style="width:12px; height:12px; border-radius:50%; background:{status_color}; box-shadow: 0 0 8px {status_color};"></div>
            <span style="font-size:15px; font-weight:700; color:{status_color};">{status_label}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 0; color:#64748b; width:40%;">Service</td>
              <td style="padding:8px 0; color:#f1f5f9; font-weight:600;">{service}</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 0; color:#64748b;">Failure Type</td>
              <td style="padding:8px 0; color:#fbbf24; font-weight:600;">{failure_type}</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 0; color:#64748b;">Risk Score</td>
              <td style="padding:8px 0; color:#f87171; font-weight:600;">{risk_score}/100</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 0; color:#64748b;">Confidence</td>
              <td style="padding:8px 0; color:#a78bfa; font-weight:600;">{confidence_score}/100</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:8px 0; color:#64748b;">Action Taken</td>
              <td style="padding:8px 0; color:#38bdf8; font-weight:600;">{action_label}</td>
            </tr>
          </table>
        </div>

        <div style="background:#0f172a; border-left:4px solid {border_color}; border-radius:8px; padding:16px; margin-bottom:20px;">
          <h4 style="margin:0 0 8px 0; color:#e2e8f0; font-size:13px; text-transform:uppercase; letter-spacing:0.1em;">Result Details</h4>
          <p style="margin:0; font-size:13px; color:#94a3b8; line-height:1.6;">{result_message}</p>
        </div>

        <a href="{DASHBOARD_URL}/healing" class="btn">View Healing Dashboard →</a>
    """

    subject = f"[Self-Healing] {service} — {status_label}"
    return _send_smtp(tenant_email, subject, _html_wrapper("Self-Healing Engine Report", body))
