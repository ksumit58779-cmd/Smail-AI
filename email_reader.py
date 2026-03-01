import imaplib
import email
from email.header import decode_header
from dotenv import load_dotenv
import os

load_dotenv()

def read_emails(limit=5):
    # Connect to Gmail
    mail = imaplib.IMAP4_SSL(os.getenv("IMAP_HOST"))
    mail.login(os.getenv("IMAP_USER"), os.getenv("IMAP_PASS"))
    mail.select("inbox")

    # Get latest emails
    _, messages = mail.search(None, "ALL")
    email_ids = messages[0].split()
    latest = email_ids[-limit:]

    emails = []
    for eid in reversed(latest):
        _, msg_data = mail.fetch(eid, "(RFC822)")
        msg = email.message_from_bytes(msg_data[0][1])

        # Decode subject
        subject, encoding = decode_header(msg["Subject"])[0]
        if isinstance(subject, bytes):
            subject = subject.decode(encoding or "utf-8")
        
        body = ""
        if msg.is_multipart() :
            for part in msg.walk() :
                if part.get_content_type() =="text/plain" :
                    body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                    break
        else :
            body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")
        
        emails.append({
            "id" : eid.decode(), 
            "subject": subject,
            "from" : msg["From"],
            "date" : msg["Date"],
            "body" : body[:500]
        })
    mail.close()
    mail.logout()
    return emails

if __name__ == "__main__":
    emails = read_emails(5)
    for e in emails:
        print(f"From: {e['from']}")
        print(f"Subject: {e['subject']}")
        print(f"Date: {e['date']}")
        print(f"Body: {e['body'][:100]}")
        print("---")

