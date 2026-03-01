import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import os

load_dotenv()

def send_email(to, subject, body):
    msg = MIMEMultipart()
    msg["From"]= os.getenv("SMTP_USER")
    msg["To"]= to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))


    with smtplib.SMTP(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT"))) as server:
        server.starttls()
        server.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS"))
        server.sendmail(os.getenv("SMTP_USER"), to, msg.as_string())
        print(f"Email sent to {to}")

if __name__ == "__main__" :
    send_email(
        to = "dv038794@gmail.com",
        subject= "complete the project at the tomorrow deadline",
        body= "hey complete the projects at the tomorrow deadline otherwise i will make a hole in your ass that will be big"
    )
