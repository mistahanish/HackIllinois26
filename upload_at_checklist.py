"""
CAT Articulated Truck - Safety & Maintenance Inspection
PDF Parser & Supabase Uploader
-------------------------------------------------------
Parses checklist items (item name + inspection description)
from the CAT Articulated Truck Safety & Maintenance Inspection PDF
and uploads them to a Supabase PostgreSQL table.

Requirements:
    pip install pdfplumber psycopg2-binary

Usage:
    # Preview without uploading
    python upload_at_checklist.py --pdf EN_AT_Safety___Maint__Inspection.pdf --dry-run

    # Upload to Supabase
    python upload_at_checklist.py --pdf EN_AT_Safety___Maint__Inspection.pdf
"""

import re
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


def print_preview():
    print(f"\n── {VEHICLE_TYPE} Checklist ({len(CHECKLIST_ITEMS)} items) ────────────────")
    current_section = None
    for section, name, desc in CHECKLIST_ITEMS:
        if section != current_section:
            current_section = section
            print(f"\n  [{section}]")
        print(f"    • {name}")
        print(f"      → {desc}")
    print()


def upload_to_supabase():
    conn = psycopg2.connect(CONNECTION_STRING)
    cur = conn.cursor()

    cur.execute(CREATE_TABLE_SQL)
    conn.commit()
    print("✓ Table ready")

    rows = [
        (VEHICLE_TYPE, section, item_name, inspection_desc)
        for section, item_name, inspection_desc in CHECKLIST_ITEMS
    ]

    insert_sql = """
        INSERT INTO checklist_templates (vehicle_type, section, item_name, inspection_desc)
        VALUES %s
    """
    execute_values(cur, insert_sql, rows)
    conn.commit()

    print(f"✓ Uploaded {len(rows)} items to Supabase → checklist_templates")
    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Upload CAT Articulated Truck checklist to Supabase"
    )
    parser.add_argument("--pdf", required=False, help="Path to PDF (not required — items are pre-parsed)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    args = parser.parse_args()

    print_preview()

    if args.dry_run:
        print("Dry run — skipping upload.")
    else:
        upload_to_supabase()


if __name__ == "__main__":
    main()