from dotenv import load_dotenv
from google import genai
import os

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def analyze_email(subject, sender, body):
    prompt = f"""
You are an email assistant. Analyze this email and respond in exactly this format:

IMPORTANCE: [1-10]
SUMMARY: [one line summary]
ACTION NEEDED: [yes/no]
SUGGESTED REPLY: [one short reply or "none"]

Email details:
From: {sender}
Subject: {subject}
Body: {body}
"""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )
    return response.text

if __name__ == "__main__":
    result = analyze_email(
        subject="Meeting tomorrow at 10am",
        sender="boss@company.com",
        body="Please confirm your attendance for tomorrow's meeting."
    )
    print(result)