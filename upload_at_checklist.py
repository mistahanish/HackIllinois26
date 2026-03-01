"""
CAT Safety & Maintenance Inspection - PDF Parser & Supabase Uploader
--------------------------------------------------------------------
Parses checklist items (item name + inspection description) from CAT PDFs
and uploads them to the checklist_templates table. Supports:
- Articulated Truck (pre-parsed)
- Wheel Loader QM, HC, GC (parsed from PDF using pdfplumber)

Requirements:
    pip install pdfplumber psycopg2-binary

Usage:
    # Articulated Truck (pre-parsed)
    python upload_at_checklist.py --dry-run
    python upload_at_checklist.py

    # Wheel Loader PDFs (parsed from file)
    python upload_at_checklist.py --pdf "EN_QM_WL_Safety & Maint. Inspection.pdf" --dry-run
    python upload_at_checklist.py --wheel-loaders --dry-run
    python upload_at_checklist.py --wheel-loaders
"""

import re
import os
import argparse
import psycopg2
from psycopg2.extras import execute_values
import pdfplumber

# ── Config ─────────────────────────────────────────────────────────────────────
CONNECTION_STRING = (
    "postgresql://postgres.guokfeyuysdecvtrrfcs:inspection-app1234"
    "@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
)

VEHICLE_TYPE = "Articulated Truck"

# Wheel Loader PDFs: filename -> (vehicle_type, display name)
WHEEL_LOADER_PDFS = {
    "EN_QM_WL_Safety & Maint. Inspection.pdf": "Wheel Loader (QM) 986G-994K",
    "EN_HC_WL_Safety & Maint. Inspection.pdf": "Wheel Loader (HC) 950-982",
    "EN_GC_WL_Safety & Maint. Inspection.pdf": "Wheel Loader (GC) 902-938",
}

# Section mapping for wheel loader PDFs: (page_0based, table_index) -> section name
WL_SECTION_MAP = {
    (0, 2): "From The Ground",
    (0, 3): "Engine Compartment",
    (1, 2): "On The Machine, Outside Cab",
    (1, 3): "Inside The Cab",
}

# ── Table schema ───────────────────────────────────────────────────────────────
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS checklist_templates (
    id              SERIAL PRIMARY KEY,
    vehicle_type    TEXT        NOT NULL,
    section         TEXT        NOT NULL,
    item_name       TEXT        NOT NULL,
    inspection_desc TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
"""

# ── All checklist items parsed from the PDF ────────────────────────────────────
# Structure: (section, item_name, inspection_description)
CHECKLIST_ITEMS = [
    # FROM THE GROUND
    ("From The Ground", "Overall machine",                                      "Loose or missing nuts or bolts, loose guards, cleanliness"),
    ("From The Ground", "Lights",                                               "Broken lamps, lenses, operation"),
    ("From The Ground", "Brakes, suspension",                                   "Leaks, damage, wear"),
    ("From The Ground", "Tires, rims, lock ring, hub, stem caps",               "Inflation, leaks, rim slippage on tire, damage, wear"),
    ("From The Ground", "Underneath front machine – steering rods & cylinders", "Leaks, damage"),
    ("From The Ground", "Suspension system mounts, cylinders",                  "Loose bolts, leaks, cylinder height, lube cylinder bearings"),
    ("From The Ground", "Exhaust & mounting bolts",                             "Loose bolts, holes in exhaust"),
    ("From The Ground", "Body",                                                 "Damage, wear, distortion"),
    ("From The Ground", "Fuel tank, hydraulic tank",                            "Leaks, levels"),
    ("From The Ground", "Underneath middle machine – Steering hydraulic system","Fluid level, leaks, worn hoses, damaged lines"),
    ("From The Ground", "Stop pads, drive shaft U-joints",                      "Broken, lubrication"),
    ("From The Ground", "Hitch pin lugs, steering cylinder lugs",               "Clearance, lubrication"),
    ("From The Ground", "Articulation frame, spherical bearing",                "Lubrication, cracks"),
    ("From The Ground", "A-frame, axle mountings",                              "Clear pivot range, loose, damage"),
    ("From The Ground", "Stabilizer rod and mountings",                         "Bent or broken, loose"),
    ("From The Ground", "Steering frame, hoist lock",                           "Damage, broken, correct position"),
    ("From The Ground", "Hoist & brake system oil",                             "Fluid level, leaks"),
    ("From The Ground", "Frame & hoist cylinders, rod eyes",                    "Cracks, leaks, damage, wear"),
    ("From The Ground", "Hoist cylinder bearings, wiper seals",                 "Worn, lubricate"),
    ("From The Ground", "Underneath rear machine – All axles, inside rear dual wheels", "Leaks, damage, wear, suspension wear, loose bolts"),
    ("From The Ground", "Welds, castings, mounting bolts",                      "Cracks, damaged bolts or pads"),
    ("From The Ground", "Backup alarm, lights, towing pin",                     "Functional, broken, dirt buildup"),
    ("From The Ground", "Pivot pins on bed",                                    "Functional, clean, lubricated, worn with play"),
    ("From The Ground", "Body frame",                                           "No cracks in welds or weld seams"),
    ("From The Ground", "Dump body, tailgate, rear frame",                      "Bed welds, cracks, distortion bending within bed & pads"),
    ("From The Ground", "Ejector truck bed, tailgate linkage",                  "Bends, cracks, breaks, deformity, wear"),
    ("From The Ground", "Ejector guide, ejector blade, rollers, cylinders",     "Wear, non-uniformity"),
    ("From The Ground", "Battery compartment",                                  "Connections, fluid level"),
    ("From The Ground", "Diesel exhaust fluid (DEF) tank (if equipped)",        "Fluid level, check for debris buildup"),

    # ENGINE / STEERING COMPARTMENT
    ("Engine / Steering Compartment", "Steering hydraulic tank, lines, hoses",  "No leaks in tank, lines or hoses"),
    ("Engine / Steering Compartment", "Filter, cap, breather, sight gauge",     "Clean filter, breather clean and not blocked, sight gauge on right side of tank"),
    ("Engine / Steering Compartment", "Engine and transmission oil",            "Fluid level"),
    ("Engine / Steering Compartment", "Hoses",                                  "Cracks, wear spots, leaks"),
    ("Engine / Steering Compartment", "All belts",                              "Tightness, wear, cracks"),
    ("Engine / Steering Compartment", "Windshield washer reservoir",            "Fluid level"),
    ("Engine / Steering Compartment", "Air filters, fuel filters, hoses & lines","Cleanliness, blockages, leaks"),
    ("Engine / Steering Compartment", "Water separator, mounting brackets",     "No water visible in water separator, tight & secure"),
    ("Engine / Steering Compartment", "Torque convertor, transmission oil",     "Check fluid levels, dipsticks"),
    ("Engine / Steering Compartment", "Engine oil filter",                      "Check for leaks"),
    ("Engine / Steering Compartment", "Lines, hoses, fan, welds",               "Leaks, worn spots on hoses, trash buildup"),

    # ON THE MACHINE, OUTSIDE CAB
    ("On The Machine, Outside Cab", "Hand rails, grab bars",                    "No damage, bends, breaks, mounting bolts secure"),
    ("On The Machine, Outside Cab", "Walkways, treadways",                      "Clear of mud, debris & tripping hazards"),
    ("On The Machine, Outside Cab", "Windshield, wipers and blades",            "Wear, damage, functional"),
    ("On The Machine, Outside Cab", "Mirrors",                                  "Clean, damage, adjustment"),
    ("On The Machine, Outside Cab", "Fire extinguisher (if equipped)",          "Charged and expiration date indicates extinguisher has been inspected and approved"),

    # INSIDE THE CAB
    ("Inside The Cab", "Overall cab interior",                                  "Cleanliness"),
    ("Inside The Cab", "Gauges, lights, switches",                              "Damage, proper function"),
    ("Inside The Cab", "Seat",                                                  "Correct adjustment, pedal reach"),
    ("Inside The Cab", "Seat belt, buckle & mounting",                          "Damage, wear, adjustment, age"),
    ("Inside The Cab", "Horn, backup alarm, lights",                            "Proper function"),
    ("Inside The Cab", "Cab air filter",                                        "Dirt"),
    ("Inside The Cab", "ROPS",                                                  "Damage, cracks"),
]


def _normalize(s: str | None) -> str:
    """Normalize whitespace and newlines."""
    if not s or not isinstance(s, str):
        return ""
    return re.sub(r"\s+", " ", s.strip())


def parse_wheel_loader_pdf(pdf_path: str, vehicle_type: str) -> list[tuple[str, str, str]]:
    """
    Parse a Wheel Loader Safety & Maintenance Inspection PDF.
    Returns list of (section, item_name, inspection_desc).
    """
    items: list[tuple[str, str, str]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for table_idx, table in enumerate(tables or []):
                section = WL_SECTION_MAP.get((page_idx, table_idx))
                if not section:
                    continue
                for row in table:
                    if not row or len(row) < 3:
                        continue
                    item = _normalize(row[0])
                    desc = _normalize(row[2])
                    if not item or "What are you" in item:
                        continue
                    items.append((section, item, desc))
    return items


def print_preview(items: list[tuple[str, str, str]] | None = None, vehicle_type: str | None = None):
    items = items or CHECKLIST_ITEMS
    vt = vehicle_type or VEHICLE_TYPE
    print(f"\n── {vt} Checklist ({len(items)} items) ────────────────")
    current_section = None
    for section, name, desc in items:
        if section != current_section:
            current_section = section
            print(f"\n  [{section}]")
        print(f"    • {name}")
        print(f"      → {desc}")
    print()


def upload_to_supabase(items: list[tuple[str, str, str]] | None = None, vehicle_type: str | None = None):
    items = items or CHECKLIST_ITEMS
    vt = vehicle_type or VEHICLE_TYPE
    conn = psycopg2.connect(CONNECTION_STRING)
    cur = conn.cursor()

    cur.execute(CREATE_TABLE_SQL)
    conn.commit()
    print("✓ Table ready")

    rows = [
        (vt, section, item_name, inspection_desc)
        for section, item_name, inspection_desc in items
    ]

    insert_sql = """
        INSERT INTO checklist_templates (vehicle_type, section, item_name, inspection_desc)
        VALUES %s
    """
    execute_values(cur, insert_sql, rows)
    conn.commit()

    print(f"✓ Uploaded {len(rows)} items ({vt}) to Supabase → checklist_templates")
    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Upload CAT Safety & Maintenance checklists to Supabase"
    )
    parser.add_argument("--pdf", help="Path to a single PDF (Wheel Loader QM/HC/GC)")
    parser.add_argument("--wheel-loaders", action="store_true", help="Parse and upload all three Wheel Loader PDFs")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))

    if args.wheel_loaders:
        for filename, vehicle_type in WHEEL_LOADER_PDFS.items():
            path = os.path.join(base_dir, filename)
            if not os.path.isfile(path):
                print(f"⚠ Skipping {filename} (file not found)")
                continue
            items = parse_wheel_loader_pdf(path, vehicle_type)
            print_preview(items, vehicle_type)
            if not args.dry_run:
                upload_to_supabase(items, vehicle_type)
        if args.dry_run:
            print("Dry run — skipping upload.")
        return

    if args.pdf:
        path = os.path.join(base_dir, args.pdf) if not os.path.isabs(args.pdf) else args.pdf
        if not os.path.isfile(path):
            print(f"Error: File not found: {path}")
            return
        basename = os.path.basename(path)
        if basename in WHEEL_LOADER_PDFS:
            vehicle_type = WHEEL_LOADER_PDFS[basename]
            items = parse_wheel_loader_pdf(path, vehicle_type)
            print_preview(items, vehicle_type)
            if not args.dry_run:
                upload_to_supabase(items, vehicle_type)
        else:
            print("Warning: Unknown PDF. Using Articulated Truck (pre-parsed).")
            print_preview()
            if not args.dry_run:
                upload_to_supabase()
        return

    # Default: Articulated Truck (pre-parsed)
    print_preview()
    if args.dry_run:
        print("Dry run — skipping upload.")
    else:
        upload_to_supabase()


if __name__ == "__main__":
    main()