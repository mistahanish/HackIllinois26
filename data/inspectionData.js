/**
 * CAT 982M Wheel Loader — inspection perspectives and inspection points.
 *
 * Each perspective has:
 *   id          — unique key
 *   label       — display name
 *   image       — require(...) for the stock photo
 *   nav         — { up, down, left, right } perspective ids (null = disabled)
 *   points      — array of inspection points for this view
 *
 * Each inspection point has:
 *   id            — globally unique (used as state key)
 *   label         — display name shown in modal title
 *   position      — { x, y } as 0–1 fractions of image width/height
 *   imageType     — maps to Gemini checklist (steps_handrails | tires_rims | cooling | hydraulic | structural | cabin | general)
 *   specificPrompt — additional guidance appended to the general Gemini prompt for this specific point
 *   referenceImage — require(...) of an example photo for the capture screen (null = placeholder)
 */

export const PERSPECTIVES = {
  // ─── EXTERIOR RING (Left/Right navigation) ─────────────────────────────────

  front: {
    id: 'front',
    label: 'Front View',
    image: require('../assets/Wheel_Loader_982m_Photos/FT.jpg'),
    nav: { up: 'cabin', down: null, left: 'front_left', right: 'front_right' },
    points: [
      {
        id: 'front_bucket',
        label: 'Front Bucket',
        position: { x: 0.50, y: 0.55 },
        imageType: 'structural',
        specificPrompt: 'Inspect the front loader bucket for structural cracks, excessive edge wear, bent/deformed shell, missing or broken teeth (if equipped), and weld integrity along the cutting edge and side walls.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FT.jpg'),
      },
      {
        id: 'front_left_wheel',
        label: 'Front Left Wheel',
        position: { x: 0.18, y: 0.75 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: Count every lug bolt on the rim. Any missing, sheared, or broken lug bolt is an immediate Critical FAIL — flag it with a bounding box. Also check: tire for flats, sidewall damage, uneven tread wear, cords showing; rim for cracks, bent sections; valve stem condition.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FL_Wheel.jpg'),
      },
      {
        id: 'front_right_wheel',
        label: 'Front Right Wheel',
        position: { x: 0.82, y: 0.75 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: Count every lug bolt on the rim. Any missing, sheared, or broken lug bolt is an immediate Critical FAIL — flag it with a bounding box. Also check: tire for flats, sidewall damage, uneven tread wear, cords showing; rim for cracks, bent sections; valve stem condition.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FR_Wheel.jpg'),
      },
      {
        id: 'front_lift_arms',
        label: 'Lift Arms & Linkage',
        position: { x: 0.50, y: 0.35 },
        imageType: 'structural',
        specificPrompt: 'Inspect the lift arms and linkage bars for cracks, bending, deformation, and weld failures. Check pins and bushings for excessive play, rust, or missing retaining hardware.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FT.jpg'),
      },
    ],
  },

  front_left: {
    id: 'front_left',
    label: 'Front-Left View',
    image: require('../assets/Wheel_Loader_982m_Photos/FL.jpg'),
    nav: { up: null, down: 'fl_wheel', left: 'left_side', right: 'front' },
    points: [
      {
        id: 'fl_hydraulic_cylinder',
        label: 'Left Hydraulic Cylinder',
        position: { x: 0.35, y: 0.40 },
        imageType: 'hydraulic',
        specificPrompt: 'Inspect the left hydraulic lift cylinder for oil leaks around the piston rod seal, damaged or scored rod, loose mounting pins, hose connections, and clamp integrity.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FL.jpg'),
      },
      {
        id: 'fl_steps',
        label: 'Left Access Steps & Handrails',
        position: { x: 0.65, y: 0.55 },
        imageType: 'steps_handrails',
        specificPrompt: 'Inspect the left-side access ladder steps for bent or broken rungs, loose mounting, and anti-slip surface. Inspect handrails for bending, cracks, loose mounts, and grip condition.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FL.jpg'),
      },
      {
        id: 'fl_wheel_close',
        label: 'Front Left Tire & Rim',
        position: { x: 0.20, y: 0.78 },
        imageType: 'tires_rims',
        specificPrompt: 'Close-up rim inspection — CRITICAL CHECK: carefully count and inspect every lug bolt. A missing bolt hole (empty), sheared bolt stub, or cracked bolt = Critical FAIL with bounding box. Also check: tread wear, sidewall cracks, bulging, cords showing, rim cracks or deformation.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FL_Wheel.jpg'),
      },
    ],
  },

  front_right: {
    id: 'front_right',
    label: 'Front-Right View',
    image: require('../assets/Wheel_Loader_982m_Photos/FR.jpg'),
    nav: { up: null, down: 'fr_wheel', left: 'front', right: 'right_side' },
    points: [
      {
        id: 'fr_hydraulic_cylinder',
        label: 'Right Hydraulic Cylinder',
        position: { x: 0.65, y: 0.40 },
        imageType: 'hydraulic',
        specificPrompt: 'Inspect the right hydraulic lift cylinder for oil leaks around the piston rod seal, damaged rod, loose mounting pins, hose connections, and clamp integrity.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FR.jpg'),
      },
      {
        id: 'fr_steps',
        label: 'Right Access Steps & Handrails',
        position: { x: 0.35, y: 0.55 },
        imageType: 'steps_handrails',
        specificPrompt: 'Inspect the right-side access steps and handrails for damage, bending, missing anti-slip surface, loose mounts, and broken grips.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FR.jpg'),
      },
      {
        id: 'fr_wheel_close',
        label: 'Front Right Tire & Rim',
        position: { x: 0.80, y: 0.78 },
        imageType: 'tires_rims',
        specificPrompt: 'Close-up rim inspection — CRITICAL CHECK: carefully count and inspect every lug bolt. A missing bolt hole (empty), sheared bolt stub, or cracked bolt = Critical FAIL with bounding box. Also check: tread wear, sidewall cracks, bulging, cords showing, rim cracks or deformation.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FR_Wheel.jpg'),
      },
    ],
  },

  right_side: {
    id: 'right_side',
    label: 'Right Side',
    image: require('../assets/Wheel_Loader_982m_Photos/RF.jpg'),
    nav: { up: 'engine_right', down: null, left: 'front_right', right: 'right_back' },
    points: [
      {
        id: 'right_body_panel',
        label: 'Right Body Panels',
        position: { x: 0.50, y: 0.40 },
        imageType: 'structural',
        specificPrompt: 'Inspect the right-side body panels and hood for dents, cracks, missing fasteners, and overall structural integrity. Check door latches and hinges.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/RF.jpg'),
      },
      {
        id: 'right_hydraulic_hose',
        label: 'Right Hydraulic Hoses',
        position: { x: 0.40, y: 0.55 },
        imageType: 'hydraulic',
        specificPrompt: 'Inspect all visible hydraulic hoses on the right side for wear, abrasion, cracking, bulging, loose clamps, and any signs of oil weeping or leaks at connections.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/RF.jpg'),
      },
      {
        id: 'right_rear_wheel',
        label: 'Rear Right Tire & Rim',
        position: { x: 0.80, y: 0.78 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: Count every lug bolt on the rim. Any missing, sheared, or broken lug bolt = Critical FAIL. Also check tire for flat, sidewall damage, tread wear, and rim for cracks.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/RF.jpg'),
      },
    ],
  },

  right_back: {
    id: 'right_back',
    label: 'Right-Rear View',
    image: require('../assets/Wheel_Loader_982m_Photos/RB.jpg'),
    nav: { up: null, down: null, left: 'right_side', right: 'back' },
    points: [
      {
        id: 'rb_counterweight',
        label: 'Counterweight',
        position: { x: 0.50, y: 0.50 },
        imageType: 'structural',
        specificPrompt: 'Inspect the rear counterweight for cracks, missing mounting bolts, structural damage, or deformation that could compromise machine balance.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/RB.jpg'),
      },
      {
        id: 'rb_exhaust',
        label: 'Exhaust & DEF System',
        position: { x: 0.60, y: 0.30 },
        imageType: 'general',
        specificPrompt: 'Inspect the exhaust stack and DEF (diesel exhaust fluid) system for physical damage, loose mounting, leaks at joints, and signs of excessive soot buildup indicating combustion issues.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/RB.jpg'),
      },
    ],
  },

  back: {
    id: 'back',
    label: 'Rear View',
    image: require('../assets/Wheel_Loader_982m_Photos/B.jpg'),
    nav: { up: 'engine_right', down: null, left: 'right_back', right: 'left_back' },
    points: [
      {
        id: 'back_rear_left_wheel',
        label: 'Rear Left Tire & Rim',
        position: { x: 0.20, y: 0.75 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: Count every lug bolt on the rim. Any missing, sheared, or broken lug bolt = Critical FAIL with bounding box. Also check: tire for flat, sidewall cracks, severe tread wear, bulging; rim for cracks and bent sections.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/BL_Wheel.jpg'),
      },
      {
        id: 'back_rear_right_wheel',
        label: 'Rear Right Tire & Rim',
        position: { x: 0.80, y: 0.75 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: Count every lug bolt on the rim. Any missing, sheared, or broken lug bolt = Critical FAIL with bounding box. Also check: tire for flat, sidewall cracks, severe tread wear, bulging; rim for cracks.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/BR_Wheel.jpg'),
      },
      {
        id: 'rear_frame',
        label: 'Rear Frame & Structure',
        position: { x: 0.50, y: 0.45 },
        imageType: 'structural',
        specificPrompt: 'Inspect the rear frame and structural components for cracks, bending, deformation, weld failures, and corrosion on load-bearing members.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/B.jpg'),
      },
    ],
  },

  left_back: {
    id: 'left_back',
    label: 'Left-Rear View',
    image: require('../assets/Wheel_Loader_982m_Photos/LB.jpg'),
    nav: { up: 'engine_left', down: null, left: 'back', right: 'left_side' },
    points: [
      {
        id: 'lb_engine_access',
        label: 'Engine Access Cover',
        position: { x: 0.50, y: 0.35 },
        imageType: 'structural',
        specificPrompt: 'Inspect the engine access hood/cover for damaged hinges, broken latches, dents preventing closure, and missing seals that could allow debris ingestion.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/LB.jpg'),
      },
      {
        id: 'lb_hydraulic_lines',
        label: 'Rear Hydraulic Lines',
        position: { x: 0.35, y: 0.55 },
        imageType: 'hydraulic',
        specificPrompt: 'Inspect rear hydraulic lines and connections for leaks, damaged hoses, loose fittings, and worn clamps. Check for oil residue indicating slow seepage.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/LB.jpg'),
      },
    ],
  },

  left_side: {
    id: 'left_side',
    label: 'Left Side',
    image: require('../assets/Wheel_Loader_982m_Photos/Left.jpg'),
    nav: { up: 'engine_left', down: null, left: 'left_back', right: 'front_left' },
    points: [
      {
        id: 'left_fuel_reservoir',
        label: 'Fuel Reservoir',
        position: { x: 0.60, y: 0.55 },
        imageType: 'general',
        specificPrompt: 'Inspect the fuel tank/reservoir for leaks, dents, corrosion, loose cap or filler neck, and damage to the tank mounting straps or brackets.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Fuel_Reservoir.jpg'),
      },
      {
        id: 'left_articulation_joint',
        label: 'Articulation Joint (Left)',
        position: { x: 0.45, y: 0.50 },
        imageType: 'structural',
        specificPrompt: 'Inspect the center articulation joint on the left side for loose or missing hardware, cracked welds, pin and bushing wear, and grease purging out of seals indicating overextended maintenance intervals.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Middle_Joint_L.jpg'),
      },
      {
        id: 'left_steps_handrails',
        label: 'Left Cab Steps',
        position: { x: 0.70, y: 0.60 },
        imageType: 'steps_handrails',
        specificPrompt: 'Inspect all left-side cab entry steps and handrails for bending, cracks, anti-slip surface wear, and loose mounting hardware.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Left.jpg'),
      },
    ],
  },

  // ─── SUB-VIEWS (Up/Down navigation) ────────────────────────────────────────

  cabin: {
    id: 'cabin',
    label: 'Operator Cab — Instrument Panel',
    image: require('../assets/Wheel_Loader_982m_Photos/Cabin_Pannel.jpg'),
    nav: { up: null, down: 'front', left: 'cabin_left', right: null },
    points: [
      {
        id: 'cab_instrument_panel',
        label: 'Instrument Panel',
        position: { x: 0.50, y: 0.40 },
        imageType: 'cabin',
        specificPrompt: 'Inspect the operator instrument panel for active fault codes, warning lights, cracked/broken gauges, missing indicator covers, and any alerts related to engine, hydraulics, or electrical systems.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Cabin_Pannel.jpg'),
      },
      {
        id: 'cab_display_screen',
        label: 'Display Screen',
        position: { x: 0.70, y: 0.35 },
        imageType: 'cabin',
        specificPrompt: 'Inspect the main display screen for cracks, dead pixels, error messages, active alarms or fault codes, and ensure the screen illuminates and displays correctly.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Cabin_Rear_Screen.jpg'),
      },
      {
        id: 'cab_controls',
        label: 'Joystick & Controls',
        position: { x: 0.30, y: 0.55 },
        imageType: 'cabin',
        specificPrompt: 'Inspect joystick controls for damaged grips, sticky or non-responsive buttons, loose mounting, and any physical damage affecting safe operation.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Cabin_Joystick.jpg'),
      },
    ],
  },

  cabin_left: {
    id: 'cabin_left',
    label: 'Cab Interior — Left Console',
    image: require('../assets/Wheel_Loader_982m_Photos/Cabin_L.jpg'),
    nav: { up: null, down: 'front_left', left: null, right: 'cabin' },
    points: [
      {
        id: 'cab_key_panel',
        label: 'Key Panel & Switches',
        position: { x: 0.45, y: 0.50 },
        imageType: 'cabin',
        specificPrompt: 'Inspect the key panel and switch console for broken switches, missing keycaps, damage to wiring harness covers, and any fault indicators illuminated.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Cabin_Key_Pannel.jpg'),
      },
      {
        id: 'cab_keyboard',
        label: 'Cab Keyboard/Input',
        position: { x: 0.60, y: 0.60 },
        imageType: 'cabin',
        specificPrompt: 'Inspect the cab keyboard and input device for broken or missing keys, physical damage, and proper mounting.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Cabin_Keyboard.jpg'),
      },
    ],
  },

  engine_left: {
    id: 'engine_left',
    label: 'Engine Compartment — Left',
    image: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_L.jpg'),
    nav: { up: null, down: 'left_side', left: null, right: 'engine_right' },
    points: [
      {
        id: 'engine_coolant_reservoir',
        label: 'Coolant Reservoir',
        position: { x: 0.30, y: 0.35 },
        imageType: 'cooling',
        specificPrompt: 'Inspect the coolant reservoir level and condition. Look for cracks in the reservoir, low fluid level, discoloration indicating combustion gas contamination, and damaged cap or overflow hose.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_L.jpg'),
      },
      {
        id: 'engine_cooling_hoses',
        label: 'Cooling Hoses & Clamps',
        position: { x: 0.50, y: 0.45 },
        imageType: 'cooling',
        specificPrompt: 'Inspect all visible coolant hoses for cracking, swelling, soft spots indicating internal breakdown, and clamp tightness. Look for coolant residue or weeping at connections.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_L.jpg'),
      },
      {
        id: 'engine_hydraulic_filter',
        label: 'Hydraulic Filtration System',
        position: { x: 0.65, y: 0.55 },
        imageType: 'hydraulic',
        specificPrompt: 'Inspect the hydraulic filter housing and filter element for bypass indicator status, housing seal condition, leaks around the housing, and filter service interval indicator.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_L.jpg'),
      },
      {
        id: 'engine_oil_level',
        label: 'Engine Oil Level',
        position: { x: 0.45, y: 0.65 },
        imageType: 'general',
        specificPrompt: 'Check the engine oil level via dipstick or sight glass. Look for correct level, oil color and consistency, and any signs of coolant contamination (milky appearance) or metal particles.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_L.jpg'),
      },
    ],
  },

  engine_right: {
    id: 'engine_right',
    label: 'Engine Compartment — Right',
    image: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_R.jpg'),
    nav: { up: null, down: 'right_side', left: 'engine_left', right: null },
    points: [
      {
        id: 'engine_air_filter',
        label: 'Air Intake & Filter',
        position: { x: 0.35, y: 0.35 },
        imageType: 'general',
        specificPrompt: 'Inspect the air filter housing for damage, proper seating, and service indicator. Check air intake hose for cracks, loose clamps, or debris ingestion path.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_R.jpg'),
      },
      {
        id: 'engine_hydraulic_reservoir',
        label: 'Hydraulic Fluid Reservoir',
        position: { x: 0.60, y: 0.45 },
        imageType: 'hydraulic',
        specificPrompt: 'Inspect the hydraulic fluid reservoir for correct fluid level, contamination, leaks at sight glass or drain plug, and condition of breather cap.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_R.jpg'),
      },
      {
        id: 'engine_belt_drive',
        label: 'Belt & Drive Components',
        position: { x: 0.50, y: 0.60 },
        imageType: 'structural',
        specificPrompt: 'Inspect visible drive belts for cracking, fraying, glazing, and proper tension. Check belt tensioners and idler pulleys for bearing noise or wobble.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/Opened_Engine_R.jpg'),
      },
    ],
  },

  // ─── WHEEL SUB-VIEWS ────────────────────────────────────────────────────────

  fl_wheel: {
    id: 'fl_wheel',
    label: 'Front Left Wheel (Close-Up)',
    image: require('../assets/Wheel_Loader_982m_Photos/FL_Wheel.jpg'),
    nav: { up: 'front_left', down: null, left: null, right: null },
    points: [
      {
        id: 'fl_wheel_tread',
        label: 'FL Tire Tread & Sidewall',
        position: { x: 0.50, y: 0.45 },
        imageType: 'tires_rims',
        specificPrompt: 'Close-up inspection of front left tire. Look for severe or uneven tread wear, cords showing, sidewall bulging or cracking, embedded debris, and valve stem condition.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FL_Wheel.jpg'),
      },
      {
        id: 'fl_rim_bolts',
        label: 'FL Rim & Lug Bolts',
        position: { x: 0.50, y: 0.70 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: This is a dedicated rim inspection. Carefully count ALL lug bolts. Any missing, sheared, stripped, or broken bolt = Critical FAIL. Flag each missing bolt with its own bounding box. Also inspect for rim cracks, weld failures, bent sections, and heavy corrosion affecting structural integrity.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FL_Wheel.jpg'),
      },
    ],
  },

  fr_wheel: {
    id: 'fr_wheel',
    label: 'Front Right Wheel (Close-Up)',
    image: require('../assets/Wheel_Loader_982m_Photos/FR_Wheel.jpg'),
    nav: { up: 'front_right', down: null, left: null, right: null },
    points: [
      {
        id: 'fr_wheel_tread',
        label: 'FR Tire Tread & Sidewall',
        position: { x: 0.50, y: 0.45 },
        imageType: 'tires_rims',
        specificPrompt: 'Close-up inspection of front right tire for uneven wear, cords showing, sidewall cracks, bulging, and valve stem condition.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FR_Wheel.jpg'),
      },
      {
        id: 'fr_rim_bolts',
        label: 'FR Rim & Lug Bolts',
        position: { x: 0.50, y: 0.70 },
        imageType: 'tires_rims',
        specificPrompt: 'CRITICAL CHECK: This is a dedicated rim inspection. Carefully count ALL lug bolts. Any missing, sheared, stripped, or broken bolt = Critical FAIL. Flag each missing bolt with its own bounding box. Also inspect for rim cracks, deformation, and corrosion affecting structural integrity.',
        referenceImage: require('../assets/Wheel_Loader_982m_Photos/FR_Wheel.jpg'),
      },
    ],
  },
};

/** Ordered list for left/right exterior ring navigation */
export const EXTERIOR_RING = [
  'front',
  'front_right',
  'right_side',
  'right_back',
  'back',
  'left_back',
  'left_side',
  'front_left',
];

/** All inspection points flattened — useful for building repair list */
export const ALL_INSPECTION_POINTS = Object.values(PERSPECTIVES).flatMap(
  (p) => p.points.map((pt) => ({ ...pt, perspectiveId: p.id, perspectiveLabel: p.label }))
);

/** Look up a single inspection point by id across all perspectives */
export function findPointById(pointId) {
  for (const perspective of Object.values(PERSPECTIVES)) {
    const pt = perspective.points.find((p) => p.id === pointId);
    if (pt) return { ...pt, perspectiveId: perspective.id, perspectiveLabel: perspective.label };
  }
  return null;
}
