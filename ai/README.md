# AI (Gemini) scripts

## Setup

1. **Create a virtual env** (recommended) and install deps:

   ```bash
   cd HackIllinois26/ai
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **API key**  
   Get a key from [Google AI Studio](https://aistudio.google.com/apikey) and add it to `HackIllinois26/.env`:

   ```
   GEMINI_API_KEY=your_key_here
   ```

   (Or set `GEMINI_API_KEY` / `GOOGLE_API_KEY` in your environment.)

## Usage

- **Basic text call:**  
  `python gemini_basic.py`

- **Send an image to Gemini and print the response:**  
  `python gemini_image_test.py path/to/image.png`  
  Example: `python gemini_image_test.py ../assets/icon.png`