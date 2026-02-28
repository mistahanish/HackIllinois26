# HackIllinois26 — Setup Instructions

Complete setup to run the mobile app, AI scripts, and optional checklist upload.

---

## Prerequisites

- **Node.js** (v18+ recommended) and **npm**
- **Conda** (Miniconda or Anaconda) — used for the `HackAstra` environment when running the Expo app
- **Git** (to clone the repo, if needed)

---

## 1. Get the project

```bash
cd /path/to/your/projects
# If cloning:
# git clone <repo-url> HackIllinois26
cd HackIllinois26
```

---

## 2. Run the React Native (Expo) app

### 2.1 Create the HackAstra conda environment (first time only)

If you don’t have a conda env named `HackAstra` yet:

```bash
conda create -n HackAstra python=3.11 -y
conda activate HackAstra
```

(You can use another Python version if your stack expects it; the app is Node/Expo and only uses this env when you run it.)

### 2.2 Install Node dependencies

From the **project root** (`HackIllinois26`):

```bash
npm install
```

### 2.3 Supabase setup (required for Create Inspection)

1. Create a [Supabase](https://supabase.com) project if you don’t have one.
2. In Supabase **SQL Editor**, run the script:
   `scripts/create_inspections_table.sql`
3. In Supabase **Settings → API**, copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key
4. Add them to a `.env` file in the project root:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   ```

5. Restart the Expo dev server (`npm start`) after editing `.env`.

Without Supabase configured, Create Inspection will fail when saving (the app will show an alert).

### 2.4 Start the app

**Option A — Use the run script (recommended)**

```bash
./run.sh
```

This activates `HackAstra` and runs `npm start` for you.

**Option B — Manual**

```bash
conda activate HackAstra
npm start
```

A terminal UI will open with a **QR code**.

### 2.5 Test on your phone (Expo Go)

1. **Same Wi‑Fi**  
   Phone and computer must be on the same Wi‑Fi network.

2. **Install Expo Go**
   - **Android:** [Expo Go on Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - **iOS:** [Expo Go on the App Store](https://apps.apple.com/app/expo-go/id982107779)

3. **Open the project**
   - **Android:** Open Expo Go → “Scan QR code” → scan the QR in the terminal.
   - **iOS:** Open the **Camera** app → point at the QR code → tap the banner to open in Expo Go.

4. The app loads; code changes will reload on save.

**Troubleshooting**

| Issue | What to do |
|-------|------------|
| “Couldn’t connect” / “Network response timed out” | Same Wi‑Fi for phone and PC; turn off VPN on both if needed; try toggling Wi‑Fi on the phone. |
| Phone and PC on different networks | In the terminal where `npm start` is running, press **`s`** to switch to **tunnel** mode, wait for the new QR code, then scan again. |
| “Incompatible SDK version” | Project uses **Expo SDK 54**. Update Expo Go, or use [expo.dev/go](https://expo.dev/go) to get a matching build. |

---

## 3. AI (Gemini) scripts (optional)

Used for text and image calls to Gemini (e.g. for future photo-based inspection features).

### 3.1 Python environment

From the project root:

```bash
cd ai
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 3.2 API key

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Add to your `.env` file in the project root (same file as Supabase vars):

   ```
   GEMINI_API_KEY=your_key_here
   ```

   Alternatively, set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in your environment.

### 3.3 Run the scripts

From the project root, with the `ai` venv activated:

```bash
# Text-only call
python ai/gemini_basic.py

# Send an image and get a description
python ai/gemini_image_test.py path/to/image.png
# Example:
python ai/gemini_image_test.py assets/icon.png
```

---

## 4. Checklist upload script (optional)

`upload_at_checklist.py` uploads the CAT Articulated Truck checklist to Supabase. Only needed if you use that backend.

### 4.1 Extra dependencies

This script uses packages not in `ai/requirements.txt`:

```bash
pip install pdfplumber psycopg2-binary
```

Use the same venv as in section 3 or a dedicated one.

### 4.2 Run

From the project root:

```bash
# Preview only (no upload)
python upload_at_checklist.py --dry-run

# Upload to Supabase (uses connection string in the script)
python upload_at_checklist.py
```

The script contains a hardcoded Supabase connection string; change it for your own project.

---

## Quick reference

| Goal | Command |
|------|--------|
| Run the Expo app | `./run.sh` or `conda activate HackAstra && npm start` |
| Install app deps | `npm install` (in project root) |
| Run Gemini text | `python ai/gemini_basic.py` (with `ai` venv and `.env` set) |
| Run Gemini image | `python ai/gemini_image_test.py <image path>` |
| Checklist upload (dry run) | `python upload_at_checklist.py --dry-run` |
