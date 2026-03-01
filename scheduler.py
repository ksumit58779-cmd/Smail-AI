from apscheduler.schedulers.background import BackgroundScheduler
from email_sender import send_email
from dotenv import load_dotenv
import json, os

load_dotenv()

scheduler = BackgroundScheduler()

def _send_job(to, subject, body):
    """Actual job that runs at scheduled time"""
    try:
        send_email(to, subject, body)
        print(f"[Scheduler] Sent email to {to}")
    except Exception as e:
        print(f"[Scheduler] Error sending to {to}: {e}")

def add_job(task_id, to, subject, body, hour, minute):
    """Add a cron job to the running scheduler"""
    scheduler.add_job(
        _send_job,
        trigger="cron",
        hour=hour,
        minute=minute,
        args=[to, subject, body],
        id=str(task_id),
        replace_existing=True
    )

def remove_job(task_id):
    """Remove a job from the running scheduler"""
    try:
        scheduler.remove_job(str(task_id))
    except Exception:
        pass  # Job might not exist in memory

def start_scheduler():
    """Load all saved tasks and start scheduler"""
    if os.path.exists("scheduled_tasks.json"):
        with open("scheduled_tasks.json", "r") as f:
            tasks = json.load(f)
        for task in tasks:
            try:
                add_job(
                    task["id"], task["to"], task["subject"],
                    task["body"], task["hour"], task["minute"]
                )
            except Exception as e:
                print(f"[Scheduler] Could not load task {task.get('id')}: {e}")

    if not scheduler.running:
        scheduler.start()
    print("[Scheduler] Started.")