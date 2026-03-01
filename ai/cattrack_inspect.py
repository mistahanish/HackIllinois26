"""
CATrack inspection: run Gemini on each HackIL26-CATrack image, save results, evaluate accuracy.

Uses a general inspection prompt (CAT-style + your prompt) and an appended checklist per image type.
Parses bounding boxes from responses and draws them on images (saved under ai/cattrack_annotated/).
Expects GEMINI_API_KEY or GOOGLE_API_KEY in HackIllinois26/.env or environment.

Usage:
  python cattrack_inspect.py [--data-dir PATH] [--output PATH] [--annotated-dir PATH] [--no-api]
  python cattrack_inspect.py --image "GoodStep.jpg"    # run on one image (by name substring)
  python cattrack_inspect.py --index 0                # run on one image (by 0-based index)
  --data-dir      path to HackIL26-CATrack
  --output        path to save results JSON
  --annotated-dir path to save images with boxes drawn (default: ai/cattrack_annotated)
  --delay         seconds between API calls (default 2; increase for free-tier throttling)
  --no-api        load existing --output and print metrics / re-draw annotated images

Why runs take a while: Each image triggers one API call (image + long prompt). Model inference
often takes several seconds per request; plus --delay between calls. Total time ≈ N * (inference + delay).
To speed up when not rate-limited: use --delay 1 or --delay 0 (risk 429 on free tier).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from google import genai
from google.genai import types as genai_types
from PIL import Image, ImageDraw, ImageFont

# Load .env from HackIllinois26 (parent of ai/)
_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
try:
    from dotenv import load_dotenv

    load_dotenv(_PROJECT_ROOT / ".env")
except ImportError:
    pass

# -----------------------------------------------------------------------------
# Image registry: path relative to data_dir, image_type, ground_truth (pass/fail)
# Image types align with checklists below (steps_handrails, tires_rims, cooling, etc.)
# -----------------------------------------------------------------------------
DEFAULT_DATA_DIR = _SCRIPT_DIR / ".." / "HackIL26-CATrack"
DEFAULT_ANNOTATED_DIR = _SCRIPT_DIR / "cattrack_annotated"
# Preferred model. Gemini 3 Pro is NOT on the free tier (0 quota); you'll get 429 on free keys.
# Free-tier models: gemini-2.5-flash, gemini-2.5-pro, gemini-2.5-flash-lite. Override via env:
#   GEMINI_MODEL=gemini-2.5-flash python cattrack_inspect.py ...
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-image-preview")

IMAGE_REGISTRY = [
    # Pass folder (ground truth: pass)
    ("Pass/GoodStep.jpg", "steps_handrails", "pass"),
    ("Pass/BrokenRimBolt1.jpg", "tires_rims", "pass"),
    ("Pass/BrokenRimBolt2.jpg", "tires_rims", "pass"),
    ("Pass/HousingSeal.jpg", "hydraulic", "pass"),
    ("Pass/HydraulicFluidTank.jpg", "hydraulic", "pass"),
    ("Pass/HydraulicHose.jpg", "hydraulic", "pass"),
    ("Pass/CoolantReservoir.jpg", "cooling", "pass"),
    ("Pass/HydraulicFluidFiltrationSystem.jpg", "hydraulic", "pass"),
    # Fail folder (ground truth: fail)
    ("Fail/DamagedAccessLadder.jpg", "steps_handrails", "fail"),
    ("Fail/StructuralDamage.jpg", "structural", "fail"),
    ("Fail/Tire ShowsSignsUnevenWear.jpg", "tires_rims", "fail"),
    ("Fail/HydraulicFluidFiltration.jpg", "hydraulic", "fail"),
    ("Fail/CoolingSystemHose.jpg", "cooling", "fail"),
    ("Fail/RustOnHydraulicComponentBracket.jpg", "hydraulic", "fail"),
]

# -----------------------------------------------------------------------------
# General prompt: JSON output with normalized bbox coordinates (0-1000)
# -----------------------------------------------------------------------------
GENERAL_PROMPT = """You are an inspection assistant for CAT machines (heavy equipment). Evaluate the provided image for the specific checklist items below. Identify any issues or damage.

Respond with a single JSON object only. No other text before or after.

Severity rules (strict – safety-first):
- Critical: Immediate danger (e.g. flat tire, broken ladder rung, major fluid leak). Always FAIL.
- Major: Damage that affects safety or operation (bent/deformed steps or structure, hose damage or loose clamps, rust/corrosion on load-bearing brackets, seal damage, visible leaks). Always FAIL.
- Minor: Cosmetic or light wear that does not affect safety or operation. PASS only if all issues are Minor.
When in doubt between Minor and Major, prefer Major and FAIL. Do not downgrade visible damage (bending, deformation, rust on critical parts, hose damage) to Minor.

Instructions:
1. Apply the checklist for the given component type (appended below).
2. For each issue: short description, severity (Critical / Major / Minor), and one bounding box. Use normalized coordinates 0-1000: "box_2d": [ymin, xmin, ymax, xmax].
3. Base assessment only on visual evidence. Avoid false positives from dirt or shadows; do not dismiss real damage as "Minor" when it affects structure, access, or fluid systems.
4. Set "verdict" to "FAIL" if any Critical or Major issue exists. Set "verdict" to "PASS" only if there are no issues or all issues are Minor.

Response format (return only this JSON):
{
  "verdict": "PASS" or "FAIL",
  "issues": [
    {
      "description": "brief description of the issue",
      "severity": "Critical" or "Major" or "Minor",
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ]
}
If no issues, use "issues": [] and "verdict": "PASS". All coordinates normalized 0-1000 (full image = [0, 0, 1000, 1000])."""

# -----------------------------------------------------------------------------
# Appended checklists per image type (condensed from PassPrompt1/2, FailPrompt1/2)
# -----------------------------------------------------------------------------
CHECKLISTS = {
    "steps_handrails": """
CHECKLIST – Steps, handrails, access (any damage here = Major/Critical → FAIL):
- Access ladder: bent, broken, or damaged rungs or rails; loose or missing rungs; deformation. = Critical/Major.
- Steps: broken/bent steps, loose mounting, structural damage, deformation, surface wear that reduces grip. Bent step = Major.
- Handrails: broken handrails, loose mounting, damaged grip.
- Glass/windshield: cracks, broken panels, operation failure.
- Mirrors: broken or missing mirrors, loose mounts.
- Engine access covers: damaged covers, broken hinges/latches.
- Cab: structural damage, roof damage.""",
    "tires_rims": """
CHECKLIST – Tires and rims:
- Tires: flat, punctures, sidewall damage, tread separation, severe/uneven wear, cords showing. Flat or severe wear = Critical.
- Rims: cracks, broken sections, bent rims, severe corrosion, loose or missing lug nuts/bolts.
- Valve stems: cracked stems, damaged caps, slow leaks.
- Undercarriage (if visible): seized pins, worn bushings, broken ice lugs.""",
    "cooling": """
CHECKLIST – Engine coolant and cooling system (hose/clamp/leak damage = Major → FAIL):
- Cooling system hoses: visible wear, damage, cracks, bulging, loose clamps, or leaks. = Major.
- Coolant level: critically low, empty reservoir, continuous loss.
- Leaks: visible coolant leaks, puddles, damaged radiator/hoses.
- Radiator: damaged guards/core, broken doors.
- Water pump: leakage, seal failure, coolant in oil.
- Climate/heating-cooling controls: non-functioning.""",
    "hydraulic": """
CHECKLIST – Hydraulic systems (rust on brackets, seal damage, leaks = Major → FAIL):
- Hoses: damage, wear, loose connections, clamp failure, leaks. = Major if visible damage or leak.
- Reservoir/tank: level, leaks, contamination.
- Filtration: bypass, clogging, housing seal damage. Seal or housing damage = Major.
- Brackets/mounts: rust, corrosion, structural weakness, loose mounts. Rust/corrosion on load-bearing brackets = Major.""",
    "structural": """
CHECKLIST – Structural condition (any bending/deformation/cracking = Major → FAIL):
- Frame and cab: cracks, bending, deformation, corrosion affecting integrity. Any visible bending or deformation = Major.
- Mounting points: loose or broken mounts, weld failures.
- Access structures: ladders, steps, handrails – bent, deformed, or broken = Major.""",
}


def get_api_key():
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise SystemExit(
            "Set GEMINI_API_KEY or GOOGLE_API_KEY in HackIllinois26/.env or your environment."
        )
    return key


def build_prompt(image_type: str) -> str:
    checklist = CHECKLISTS.get(
        image_type,
        "CHECKLIST – General: Look for damage, wear, leaks, loose or missing hardware, and safety issues.",
    )
    return (
        GENERAL_PROMPT + "\n\nComponent type for this image: " + image_type + checklist
    )


def _parse_response_json(text: str):
    """Try to extract and parse a JSON object from the response (handles markdown code blocks)."""
    if not text or not text.strip():
        return None
    raw = text.strip()
    # Strip markdown code block if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    # Find first { and last }
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def parse_verdict_and_boxes(
    text: str, img_width: int, img_height: int
) -> tuple[str | None, list[list[int]]]:
    """Parse response: prefer JSON (verdict + box_2d normalized 0-1000); fall back to legacy text. Returns (verdict, boxes_pixels)."""
    # Try JSON first
    data = _parse_response_json(text)
    if data is not None:
        verdict_raw = data.get("verdict") or data.get("Verdict")
        verdict = None
        if isinstance(verdict_raw, str):
            v = verdict_raw.strip().upper()
            if v == "PASS":
                verdict = "pass"
            elif v == "FAIL":
                verdict = "fail"
        issues = data.get("issues") or data.get("anomalies") or []
        boxes = []
        norm_scale_x = img_width / 1000.0
        norm_scale_y = img_height / 1000.0
        for item in issues if isinstance(issues, list) else []:
            if not isinstance(item, dict):
                continue
            # box_2d: [ymin, xmin, ymax, xmax] normalized 0-1000
            b = item.get("box_2d") or item.get("box_2D")
            if not b or len(b) != 4:
                continue
            try:
                ymin, xmin, ymax, xmax = (float(b[i]) for i in range(4))
            except (TypeError, ValueError):
                continue
            x1 = int(xmin * norm_scale_x)
            y1 = int(ymin * norm_scale_y)
            x2 = int(xmax * norm_scale_x)
            y2 = int(ymax * norm_scale_y)
            boxes.append([x1, y1, x2, y2])
        return verdict, boxes

    # Fallback: legacy VERDICT line + regex bboxes
    verdict = parse_verdict(text)
    boxes = parse_bboxes(text, img_width, img_height)
    return verdict, boxes


def parse_bboxes(text: str, img_width: int, img_height: int) -> list[list[int]]:
    """Extract bounding boxes from response (legacy formats). Returns list of [x1, y1, x2, y2] in pixel coords."""
    if not text:
        return []
    boxes = []

    def add_box(x1: float, y1: float, x2: float, y2: float) -> None:
        if max(x1, y1, x2, y2) <= 1 and min(x1, y1, x2, y2) >= 0:
            x1, x2 = x1 * img_width, x2 * img_width
            y1, y2 = y1 * img_height, y2 * img_height
        boxes.append([int(x1), int(y1), int(x2), int(y2)])

    # Normalized 0-1000 box_2d [ymin, xmin, ymax, xmax] (e.g. from JSON fragment)
    for m in re.finditer(
        r'"box_2d"\s*:\s*\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]',
        text,
    ):
        ymin, xmin, ymax, xmax = (float(m.group(i)) for i in range(1, 5))
        boxes.append(
            [
                int(xmin * img_width / 1000),
                int(ymin * img_height / 1000),
                int(xmax * img_width / 1000),
                int(ymax * img_height / 1000),
            ]
        )
    # coordinates: [(100, 100), (200, 200)] or [(100,100),(200,200)]
    for m in re.finditer(
        r"\[\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*,\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*\]",
        text,
    ):
        add_box(*(float(m.group(i)) for i in range(1, 5)))
    # (x1, y1), (x2, y2) or (x1,y1) to (x2,y2)
    for m in re.finditer(
        r"\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*(?:,|to)\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)",
        text,
        re.IGNORECASE,
    ):
        add_box(*(float(m.group(i)) for i in range(1, 5)))
    # x1, y1 to x2, y2 (no parens)
    for m in re.finditer(
        r"(?:^|[^\d])(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?=[^\d]|$)",
        text,
        re.IGNORECASE,
    ):
        add_box(*(float(m.group(i)) for i in range(1, 5)))
    # Dedupe by rounding
    seen = set()
    unique = []
    for b in boxes:
        key = (b[0] // 10, b[1] // 10, b[2] // 10, b[3] // 10)
        if key not in seen:
            seen.add(key)
            unique.append(b)
    return unique


def draw_boxes_and_save(
    image_path: Path,
    boxes: list[list[int]],
    output_path: Path,
    verdict: str | None = None,
    ground_truth: str | None = None,
) -> None:
    """Draw bounding boxes on image and save to output_path."""
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size
    # Try default font; fallback to default size
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except (OSError, AttributeError):
        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 14
            )
        except (OSError, AttributeError):
            font = ImageFont.load_default()
    for i, (x1, y1, x2, y2) in enumerate(boxes):
        # Clamp to image
        x1, x2 = max(0, min(x1, x2, w)), min(w, max(x1, x2))
        y1, y2 = max(0, min(y1, y2, h)), min(h, max(y1, y2))
        draw.rectangle([x1, y1, x2, y2], outline="red", width=max(2, min(w, h) // 300))
        draw.text((x1, max(0, y1 - 18)), f"Issue {i + 1}", fill="red", font=font)
    # Verdict / ground truth caption (background so it's readable)
    caption = f"Verdict: {verdict or 'N/A'} | Ground truth: {ground_truth or 'N/A'}"
    try:
        bbox = draw.textbbox((0, 0), caption, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        tw, th = 14 * len(caption), 18
    draw.rectangle([2, 2, 6 + tw, 4 + th], outline="black", fill="white")
    draw.text((5, 5), caption, fill="black", font=font)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, quality=95)


def parse_verdict(text: str) -> str | None:
    """Extract VERDICT: PASS or VERDICT: FAIL from model output. Returns 'pass', 'fail', or None."""
    if not text:
        return None
    # Prefer last occurrence in case model repeats
    matches = list(re.finditer(r"VERDICT\s*:\s*(PASS|FAIL)", text, re.IGNORECASE))
    if matches:
        return matches[-1].group(1).lower()
    text_upper = text.strip().upper().replace(" ", "")
    if "VERDICT:PASS" in text_upper:
        return "pass"
    if "VERDICT:FAIL" in text_upper:
        return "fail"
    return None


def _extract_usage(response) -> dict | None:
    """Extract token usage from generate_content response. Returns dict or None."""
    if response is None:
        return None
    usage = getattr(response, "usage_metadata", None) or getattr(
        response, "usage", None
    )
    if usage is None:
        return None
    input_tokens = getattr(usage, "prompt_token_count", None)
    output_tokens = getattr(usage, "candidates_token_count", None)
    total_tokens = getattr(usage, "total_token_count", None)
    if input_tokens is None and output_tokens is None and total_tokens is None:
        return None
    out = {}
    if input_tokens is not None:
        out["input_tokens"] = int(input_tokens)
    if output_tokens is not None:
        out["output_tokens"] = int(output_tokens)
    if total_tokens is not None:
        out["total_tokens"] = int(total_tokens)
    elif out:
        out["total_tokens"] = out.get("input_tokens", 0) + out.get("output_tokens", 0)
    return out if out else None


def _mime_for_path(path: Path) -> str:
    suf = path.suffix.lower()
    return (
        "image/jpeg"
        if suf in (".jpg", ".jpeg")
        else "image/png"
        if suf == ".png"
        else "image/jpeg"
    )


def run_inspection(
    data_dir: Path,
    client,
    *,
    registry_subset: list[tuple[str, str, str]] | None = None,
    delay_seconds: float = 2.0,
    annotated_dir: Path | None = None,
) -> list[dict]:
    """Run Gemini on each image; return list of result dicts. Optionally draw boxes and save."""
    data_dir = data_dir.resolve()
    entries = registry_subset if registry_subset is not None else IMAGE_REGISTRY
    results = []
    for i, (rel_path, image_type, ground_truth) in enumerate(entries):
        path = data_dir / rel_path
        if not path.is_file():
            print(f"Skip (missing): {rel_path}", file=sys.stderr)
            results.append(
                {
                    "image": rel_path,
                    "image_type": image_type,
                    "ground_truth": ground_truth,
                    "error": "file not found",
                    "verdict": None,
                    "raw_response": None,
                    "bounding_boxes": [],
                    "token_usage": None,
                }
            )
            continue
        prompt = build_prompt(image_type)
        try:
            img = Image.open(path).convert("RGB")
            w, h = img.size
            image_bytes = path.read_bytes()
            mime = _mime_for_path(path)
            contents = [
                prompt,
                genai_types.Part.from_bytes(data=image_bytes, mime_type=mime),
            ]
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
            )
            raw = response.text if response else None
            verdict, boxes = parse_verdict_and_boxes(raw, w, h) if raw else (None, [])
            token_usage = _extract_usage(response)
        except Exception as e:
            raw = None
            verdict = None
            boxes = []
            token_usage = None
            print(f"Error {rel_path}: {e}", file=sys.stderr)
        result = {
            "image": rel_path,
            "image_type": image_type,
            "ground_truth": ground_truth,
            "verdict": verdict,
            "raw_response": raw,
            "error": None,
            "bounding_boxes": boxes,
            "token_usage": token_usage,
        }
        results.append(result)
        if annotated_dir is not None:
            out_name = Path(rel_path).stem + "_annotated.jpg"
            out_path = annotated_dir / out_name
            draw_boxes_and_save(
                path, boxes, out_path, verdict=verdict, ground_truth=ground_truth
            )
            print(f"  -> {out_path}", file=sys.stderr)
        if delay_seconds > 0 and i < len(entries) - 1:
            time.sleep(delay_seconds)
    return results


def evaluate(results: list[dict]) -> dict:
    """Compute accuracy and per-class stats."""
    total = len(results)
    correct = sum(
        1 for r in results if r.get("verdict") and r["verdict"] == r["ground_truth"]
    )
    # Per ground-truth class
    by_truth = {"pass": {"correct": 0, "total": 0}, "fail": {"correct": 0, "total": 0}}
    for r in results:
        gt = r.get("ground_truth")
        if gt not in by_truth:
            continue
        by_truth[gt]["total"] += 1
        if r.get("verdict") == gt:
            by_truth[gt]["correct"] += 1
    return {
        "total": total,
        "correct": correct,
        "accuracy": correct / total if total else 0.0,
        "by_ground_truth": {
            k: {
                "correct": v["correct"],
                "total": v["total"],
                "accuracy": v["correct"] / v["total"] if v["total"] else 0.0,
            }
            for k, v in by_truth.items()
        },
    }


def filter_registry(
    name_substring: str | None, index: int | None
) -> list[tuple[str, str, str]]:
    """Return subset of IMAGE_REGISTRY by name (substring) or 0-based index."""
    if name_substring is not None:
        name_substring = name_substring.strip().lower()
        subset = [
            (p, t, g) for p, t, g in IMAGE_REGISTRY if name_substring in p.lower()
        ]
        if not subset:
            raise SystemExit(
                f"No image path contains {name_substring!r}. List: {[p for p, _, _ in IMAGE_REGISTRY]}"
            )
        return subset
    if index is not None:
        if index < 0 or index >= len(IMAGE_REGISTRY):
            raise SystemExit(
                f"--index must be 0..{len(IMAGE_REGISTRY) - 1} (got {index})"
            )
        return [IMAGE_REGISTRY[index]]
    return IMAGE_REGISTRY


def main():
    parser = argparse.ArgumentParser(
        description="Run Gemini CATrack inspection and evaluate accuracy."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="Path to HackIL26-CATrack",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_SCRIPT_DIR / "cattrack_results.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--annotated-dir",
        type=Path,
        default=DEFAULT_ANNOTATED_DIR,
        help="Folder to save images with bounding boxes drawn (default: ai/cattrack_annotated)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        metavar="SECS",
        help="Seconds between API calls (default 2). Use 1 or 0 to speed up if not rate-limited.",
    )
    parser.add_argument(
        "--image",
        type=str,
        default=None,
        metavar="NAME",
        help="Run only on images whose path contains this string (e.g. GoodStep.jpg or Pass/GoodStep)",
    )
    parser.add_argument(
        "--index",
        type=int,
        default=None,
        metavar="N",
        help="Run only on the N-th image (0-based; use python cattrack_inspect.py --index 0)",
    )
    parser.add_argument(
        "--no-api",
        action="store_true",
        help="Skip API; load --output and print metrics only; if --annotated-dir set, re-draw from saved boxes",
    )
    args = parser.parse_args()

    if args.no_api:
        if not args.output.is_file():
            print(f"File not found: {args.output}", file=sys.stderr)
            sys.exit(1)
        with open(args.output) as f:
            data = json.load(f)
        results = data.get("results", data) if isinstance(data, dict) else data
        metrics = evaluate(results)
        print(json.dumps(metrics, indent=2))
        data_dir = Path(data.get("data_dir", args.data_dir.resolve()))
        if args.annotated_dir and data_dir.is_dir():
            for r in results:
                boxes = r.get("bounding_boxes") or []
                if not boxes:
                    continue
                rel = r.get("image")
                if not rel:
                    continue
                src = data_dir / rel
                if src.is_file():
                    out_name = Path(rel).stem + "_annotated.jpg"
                    draw_boxes_and_save(
                        src,
                        boxes,
                        args.annotated_dir / out_name,
                        verdict=r.get("verdict"),
                        ground_truth=r.get("ground_truth"),
                    )
                    print(
                        f"Annotated: {args.annotated_dir / out_name}", file=sys.stderr
                    )
        return

    data_dir = args.data_dir.resolve()
    if not data_dir.is_dir():
        print(f"Data dir not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    registry_subset = filter_registry(args.image, args.index)
    api_key = get_api_key()
    client = genai.Client(api_key=api_key)

    print(
        f"Running inspection on {len(registry_subset)} image(s) (delay={args.delay}s)...",
        file=sys.stderr,
    )
    results = run_inspection(
        data_dir,
        client,
        registry_subset=registry_subset,
        delay_seconds=args.delay,
        annotated_dir=args.annotated_dir,
    )
    metrics = evaluate(results)

    def _t(r: dict, key: str) -> int:
        u = r.get("token_usage") or {}
        return int(u.get(key, 0))

    token_summary = {
        "total_input_tokens": sum(_t(r, "input_tokens") for r in results),
        "total_output_tokens": sum(_t(r, "output_tokens") for r in results),
        "total_tokens": sum(_t(r, "total_tokens") for r in results),
        "requests_with_usage": sum(1 for r in results if r.get("token_usage")),
    }
    if token_summary["total_tokens"] == 0 and (
        token_summary["total_input_tokens"] or token_summary["total_output_tokens"]
    ):
        token_summary["total_tokens"] = (
            token_summary["total_input_tokens"] + token_summary["total_output_tokens"]
        )

    out_data = {
        "run_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data_dir": str(data_dir),
        "image_registry": [
            {"path": p, "type": t, "ground_truth": g} for p, t, g in IMAGE_REGISTRY
        ],
        "results": results,
        "metrics": metrics,
        "token_usage_summary": token_summary,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(out_data, f, indent=2)

    print("\n--- Metrics ---")
    print(json.dumps(metrics, indent=2))
    print("\n--- Token usage ---")
    print(json.dumps(token_summary, indent=2))
    print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
