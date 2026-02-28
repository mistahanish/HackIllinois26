"""
Test sending images to Gemini and print the response.
Usage: python gemini_image_test.py [path_to_image]
  If no path is given, uses a placeholder message so you can add an image path.
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

    image_path = (sys.argv[1:] or [None])[0]
    if not image_path or not os.path.isfile(image_path):
        print(
            "Usage: python gemini_image_test.py <path_to_image>\n"
            "Example: python gemini_image_test.py ../assets/icon.png",
            file=sys.stderr,
        )
        sys.exit(1)

    from PIL import Image

    img = Image.open(image_path)

    prompt = "What is in this image? Describe it briefly in 1–2 sentences."
    response = model.generate_content([prompt, img])
    print(response.text)


if __name__ == "__main__":
    main()
