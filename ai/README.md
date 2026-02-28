# AI (Gemini) scripts

## Setup

1. **Install deps** from the main project folder (requirements.txt lives there):

   ```bash
   cd HackIllinois26
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

- **CATrack inspection (HackIL26-CATrack):**  
  Run Gemini on each Pass/Fail image; bounding boxes from the response are parsed and drawn on images (saved under `ai/cattrack_annotated/`). Rate limiting is applied between requests for free-tier throttling.

  ```bash
  cd ai
  python cattrack_inspect.py --data-dir ../HackIL26-CATrack --output cattrack_results.json
  ```

  **Single image** (by name or index):

  ```bash
  python cattrack_inspect.py --image "GoodStep.jpg"
  python cattrack_inspect.py --index 0
  ```

  **Options:** `--annotated-dir PATH` (where to save images with boxes; default `ai/cattrack_annotated`), `--delay SECS` (seconds between API calls; default 2 for free tier).

  Re-run metrics or re-draw annotated images from saved results (no API calls):

  ```bash
  python cattrack_inspect.py --no-api --output cattrack_results.json
  ```

  Images and their types are listed in `IMAGE_REGISTRY` and `CHECKLISTS` in `cattrack_inspect.py`.
