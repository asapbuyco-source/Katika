// ── Table Dimensions ──────────────────────────────────────────────────────────
export const TABLE_WIDTH = 900;
export const TABLE_HEIGHT = 450;
export const CUSHION_THICKNESS = 36;
export const RAIL_WIDTH = 38;
export const CORNER_POCKET_RADIUS = 24;
export const SIDE_POCKET_RADIUS = 21;

// ── Ball ──────────────────────────────────────────────────────────────────────
export const BALL_RADIUS = 14;

// ── Physics (tuned from GML 5.1 reference) ───────────────────────────────────
export const FRICTION = 0.9845;        // per-frame rolling friction
export const SPIN_FRICTION = 0.92;     // spin decay
export const MIN_VELOCITY = 0.12;      // below this → zero (avoids eternal rolling)
export const BALL_RESTITUTION = 0.96;  // realistic ball-ball collisions (was 1.0)
export const CUSHION_RESTITUTION = 0.80; // cushion energy retention
export const SUBSTEPS = 10;            // physics sub-steps per frame for accuracy

// ── Cue ───────────────────────────────────────────────────────────────────────
export const CUE_LENGTH = 290;
export const CUE_WIDTH_BACK = 5.5;
export const CUE_WIDTH_TIP = 1.5;
export const MAX_POWER = 22;

// ── Visual Colors ─────────────────────────────────────────────────────────────
export const FELT_COLOR   = '#0f7a38';
export const FELT_COLOR_2 = '#0a6228';
export const CUSHION_COLOR = '#0d8838';
export const CUSHION_HIGHLIGHT = '#12a848';
export const WOOD_COLOR   = '#5a3a20';
export const WOOD_COLOR_2 = '#3d2512';
export const POCKET_COLOR = '#050505';

// ── Ball Colors ───────────────────────────────────────────────────────────────
export const BALL_COLORS: Record<number, string> = {
    0:  '#f0f0f0',
    1:  '#f5c518', 2:  '#1a3fbf', 3:  '#d42020', 4:  '#6b2fa0',
    5:  '#e8751a', 6:  '#1a8a3a', 7:  '#8b1a1a', 8:  '#1a1a1a',
    9:  '#f5c518', 10: '#1a3fbf', 11: '#d42020', 12: '#6b2fa0',
    13: '#e8751a', 14: '#1a8a3a', 15: '#8b1a1a',
};

export const BALL_IS_STRIPE: Record<number, boolean> = {
    9: true, 10: true, 11: true, 12: true,
    13: true, 14: true, 15: true,
};

// ── Pocket Positions (in table-local space: 0,0 = cushion top-left) ──────────
export const POCKETS = [
    { x: CUSHION_THICKNESS + 3,                        y: CUSHION_THICKNESS + 3,                        r: CORNER_POCKET_RADIUS },
    { x: TABLE_WIDTH / 2 + CUSHION_THICKNESS,           y: CUSHION_THICKNESS - 2,                        r: SIDE_POCKET_RADIUS   },
    { x: TABLE_WIDTH + CUSHION_THICKNESS - 3,           y: CUSHION_THICKNESS + 3,                        r: CORNER_POCKET_RADIUS },
    { x: CUSHION_THICKNESS + 3,                        y: TABLE_HEIGHT + CUSHION_THICKNESS - 3,          r: CORNER_POCKET_RADIUS },
    { x: TABLE_WIDTH / 2 + CUSHION_THICKNESS,           y: TABLE_HEIGHT + CUSHION_THICKNESS + 2,         r: SIDE_POCKET_RADIUS   },
    { x: TABLE_WIDTH + CUSHION_THICKNESS - 3,           y: TABLE_HEIGHT + CUSHION_THICKNESS - 3,         r: CORNER_POCKET_RADIUS },
];

// ── Field Boundaries (playing surface edges) ──────────────────────────────────
export const FIELD_LEFT   = CUSHION_THICKNESS;
export const FIELD_RIGHT  = TABLE_WIDTH  + CUSHION_THICKNESS;
export const FIELD_TOP    = CUSHION_THICKNESS;
export const FIELD_BOTTOM = TABLE_HEIGHT + CUSHION_THICKNESS;

// ── Rack & Break Positions ────────────────────────────────────────────────────
export const RACK_X   = FIELD_LEFT + TABLE_WIDTH  * 0.72;
export const RACK_Y   = FIELD_TOP  + TABLE_HEIGHT / 2;
export const BREAK_X  = FIELD_LEFT + TABLE_WIDTH  * 0.25;
export const BREAK_Y  = FIELD_TOP  + TABLE_HEIGHT / 2;