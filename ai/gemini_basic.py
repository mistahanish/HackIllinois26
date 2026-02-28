"""
Basic Gemini API call (text-only).
Set GEMINI_API_KEY or GOOGLE_API_KEY in HackIllinois26/.env or in your environment.
"""
import os
import sys

# Load .env from parent directory (HackIllinois26)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
except ImportError:
    pass

import google.generativeai as genai

def get_api_key():
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise SystemExit(
            "Set GEMINI_API_KEY or GOOGLE_API_KEY in HackIllinois26/.env or your environment."
        )
    return key

def main():
    api_key = get_api_key()
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    response = model.generate_content("Say hello in one short sentence.")
    print(response.text)

if __name__ == "__main__":
    main()
