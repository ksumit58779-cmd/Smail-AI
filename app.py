from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os, json, imaplib, uuid
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime

from email_reader import read_emails
from email_sender import send_email
from ai_brain import analyze_email
from scheduler import start_scheduler, add_job, remove_job
from google import genai

load_dotenv()
app = Flask(__name__)

@app.errorhandler(Exception)
def handle_error(e):
    return jsonify({"error": str(e)}), 500

try:
    start_scheduler()
except Exception as e:
    print(f"Scheduler warning: {e}")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def get_contacts():
    with open("contacts.json", "r") as f:
        return json.load(f).get("contacts", [])

def resolve_email(name_or_email):
    if not name_or_email:
        return None
    if "@" in name_or_email:
        return name_or_email
    for c in get_contacts():
        if c["name"].lower() == name_or_email.lower():
            return c["email"]
    return None

def load_tasks():
    if not os.path.exists("scheduled_tasks.json"):
        return []
    with open("scheduled_tasks.json", "r") as f:
        return json.load(f)

def save_tasks(tasks):
    with open("scheduled_tasks.json", "w") as f:
        json.dump(tasks, f, indent=2)

def date_in_week(date_str, since):
    try:
        return parsedate_to_datetime(date_str).replace(tzinfo=None) >= since
    except:
        return False

# ── PAGES ──────────────────────────────────────────
@app.route("/")
def home():
    return render_template("index.html")

# ── EMAILS ─────────────────────────────────────────
@app.route("/emails", methods=["GET"])
def get_emails():
    try:
        return jsonify(read_emails(limit=15))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json()
        result = analyze_email(data["subject"], data["sender"], data["body"])
        return jsonify({"analysis": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/send", methods=["POST"])
def send():
    try:
        data = request.get_json()
        to = resolve_email(data.get("to", ""))
        if not to:
            return jsonify({"error": f"Contact '{data.get('to')}' not found"}), 404
        send_email(to, data.get("subject", ""), data.get("body", ""))
        return jsonify({"status": "sent", "to": to})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/delete", methods=["POST"])
def delete_email():
    try:
        data = request.get_json()
        mail = imaplib.IMAP4_SSL(os.getenv("IMAP_HOST"))
        mail.login(os.getenv("IMAP_USER"), os.getenv("IMAP_PASS"))
        mail.select("inbox")
        mail.store(data["id"], "+FLAGS", "\\Deleted")
        mail.expunge()
        mail.close()
        mail.logout()
        return jsonify({"status": "deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/count", methods=["GET"])
def email_count():
    try:
        emails   = read_emails(limit=20)
        week_ago = datetime.now() - timedelta(days=7)
        count    = sum(1 for e in emails if date_in_week(e.get("date", ""), week_ago))
        return jsonify({"emails_this_week": count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── CONTACTS ───────────────────────────────────────
@app.route("/contacts", methods=["GET"])
def contacts_list():
    try:
        return jsonify(get_contacts())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/contacts/add", methods=["POST"])
def contacts_add():
    try:
        data = request.get_json()
        with open("contacts.json", "r") as f:
            store = json.load(f)
        contact = {
            "id":    str(uuid.uuid4())[:8],
            "name":  data["name"],
            "email": data["email"]
        }
        store["contacts"].append(contact)
        with open("contacts.json", "w") as f:
            json.dump(store, f, indent=2)
        return jsonify({"status": "saved", "contact": contact})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/contacts/delete/<cid>", methods=["POST"])
def contacts_delete(cid):
    try:
        with open("contacts.json", "r") as f:
            store = json.load(f)
        store["contacts"] = [c for c in store["contacts"] if c.get("id") != cid]
        with open("contacts.json", "w") as f:
            json.dump(store, f, indent=2)
        return jsonify({"status": "deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/contacts/edit/<cid>", methods=["POST"])
def contacts_edit(cid):
    try:
        data = request.get_json()
        with open("contacts.json", "r") as f:
            store = json.load(f)
        for c in store["contacts"]:
            if c.get("id") == cid:
                c["name"]  = data.get("name",  c["name"])
                c["email"] = data.get("email", c["email"])
        with open("contacts.json", "w") as f:
            json.dump(store, f, indent=2)
        return jsonify({"status": "updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── SCHEDULED TASKS ────────────────────────────────
@app.route("/schedule/add", methods=["POST"])
def schedule_add():
    try:
        data = request.get_json()
        to   = resolve_email(data.get("to", ""))
        if not to:
            return jsonify({"error": f"Contact '{data.get('to')}' not found"}), 404

        task = {
            "id":      str(uuid.uuid4())[:8],
            "to":      to,
            "subject": data["subject"],
            "body":    data["body"],
            "hour":    int(data["hour"]),
            "minute":  int(data["minute"])
        }
        tasks = load_tasks()
        tasks.append(task)
        save_tasks(tasks)
        add_job(task["id"], task["to"], task["subject"], task["body"], task["hour"], task["minute"])
        return jsonify({"status": "scheduled", "task": task})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/schedule/list", methods=["GET"])
def schedule_list():
    try:
        return jsonify(load_tasks())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/schedule/delete/<tid>", methods=["POST"])
def schedule_delete(tid):
    try:
        tasks = load_tasks()
        tasks = [t for t in tasks if t.get("id") != tid]
        save_tasks(tasks)
        remove_job(tid)
        return jsonify({"status": "deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/schedule/edit/<tid>", methods=["POST"])
def schedule_edit(tid):
    try:
        data  = request.get_json()
        tasks = load_tasks()
        for t in tasks:
            if t.get("id") == tid:
                to = resolve_email(data.get("to", t["to"]))
                t["to"]      = to or t["to"]
                t["subject"] = data.get("subject", t["subject"])
                t["body"]    = data.get("body",    t["body"])
                t["hour"]    = int(data.get("hour",   t["hour"]))
                t["minute"]  = int(data.get("minute", t["minute"]))
                add_job(tid, t["to"], t["subject"], t["body"], t["hour"], t["minute"])
        save_tasks(tasks)
        return jsonify({"status": "updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── AI COMMAND ─────────────────────────────────────
@app.route("/command", methods=["POST"])
def ai_command():
    try:
        data     = request.get_json()
        command  = data.get("command", "")
        contacts = get_contacts()
        emails   = read_emails(limit=3)

        emails_str   = "\n".join([f"- ID:{e['id']} From:{e['from']} Subject:{e['subject']}" for e in emails])
        contacts_str = "\n".join([f"- {c['name']}: {c['email']}" for c in contacts])

        prompt = f"""You are Smail AI. Respond in STRICT JSON only. No markdown, no extra text.

Contacts:
{contacts_str or "none"}

Recent emails:
{emails_str or "none"}

User email: {os.getenv("IMAP_USER")}
Command: "{command}"

Respond with exactly this JSON:
{{"action":"send_email"|"analyze_email"|"delete_email"|"count_emails"|"reply_email"|"chat","message":"one sentence","to":"","subject":"","body":"","email_id":"","reply":""}}"""

        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        raw      = response.text.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw    = raw.strip()
        parsed = json.loads(raw)
        action = parsed.get("action", "chat")

        if action == "send_email":
            to = resolve_email(parsed.get("to", ""))
            if not to:
                return jsonify({"error": "Could not find recipient"}), 400
            send_email(to, parsed["subject"], parsed["body"])
            return jsonify({"status":"done","action":"send_email","message":parsed["message"],"to":to})

        elif action == "analyze_email":
            eid    = parsed.get("email_id", "")
            target = next((e for e in emails if e["id"] == eid), emails[0] if emails else None)
            if not target:
                return jsonify({"error": "No email to analyze"}), 404
            analysis = analyze_email(target["subject"], target["from"], target["body"])
            return jsonify({"status":"done","action":"analyze_email","message":parsed["message"],"analysis":analysis,"email":target})

        elif action == "count_emails":
            week_ago   = datetime.now() - timedelta(days=7)
            all_emails = read_emails(limit=50)
            count      = sum(1 for e in all_emails if date_in_week(e.get("date",""), week_ago))
            return jsonify({"status":"done","action":"count_emails","message":f"You received {count} emails this week.","count":count})

        elif action == "delete_email":
            eid = parsed.get("email_id", "")
            if eid:
                mail = imaplib.IMAP4_SSL(os.getenv("IMAP_HOST"))
                mail.login(os.getenv("IMAP_USER"), os.getenv("IMAP_PASS"))
                mail.select("inbox")
                mail.store(eid, "+FLAGS", "\\Deleted")
                mail.expunge()
                mail.close()
                mail.logout()
            return jsonify({"status":"done","action":"delete_email","message":parsed["message"]})

        elif action == "reply_email":
            eid    = parsed.get("email_id","")
            target = next((e for e in emails if e["id"]==eid), emails[0] if emails else None)
            if target:
                send_email(target["from"], f"Re: {target['subject']}", parsed["body"])
            return jsonify({"status":"done","action":"reply_email","message":parsed["message"]})

        else:
            return jsonify({"status":"done","action":"chat","message":parsed.get("reply") or parsed.get("message","Done.")})

    except json.JSONDecodeError:
        return jsonify({"status":"done","action":"chat","message":response.text[:400]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)