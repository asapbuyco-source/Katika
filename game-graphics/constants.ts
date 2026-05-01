// Table dimensions
export const TABLE_WIDTH = 900;
export const TABLE_HEIGHT = 450;
export const CUSHION_THICKNESS = 36;
export const CORNER_POCKET_RADIUS = 22;
export const SIDE_POCKET_RADIUS = 20;

// Ball
export const BALL_RADIUS = 14;

// Physics
export const FRICTION = 0.985;
export const SPIN_FRICTION = 0.92;
export const MIN_VELOCITY = 0.08;
export const BALL_RESTITUTION = 0.96;
export const CUSHION_RESTITUTION = 0.72;

// Cue
export const CUE_LENGTH = 300;
export const CUE_WIDTH_BACK = 10;
export const CUE_WIDTH_TIP = 3;
export const MAX_POWER = 28;

// Colors
export const FELT_COLOR = '#1a6b3a';
export const FELT_COLOR_2 = '#175f33';
export const CUSHION_COLOR = '#1d5c2e';
export const WOOD_COLOR = '#6b3a1f';
export const WOOD_COLOR_2 = '#8B4513';
export const POCKET_COLOR = '#0a0a0a';

// Ball colors for 8-ball pool
export const BALL_COLORS: Record<number, string> = {
    0: '#f8f8f0',
    1: '#f5c542',
    2: '#1a44c8',
    3: '#e02020',
    4: '#9b59b6',
    5: '#e07820',
    6: '#1e8c1e',
    7: '#8B0000',
    8: '#111111',
    9: '#f5c542',
    10: '#1a44c8',
    11: '#e02020',
    12: '#9b59b6',
    13: '#e07820',
    14: '#1e8c1e',
    15: '#8B0000',
};

export const BALL_IS_STRIPE: Record<number, boolean> = {
    9: true, 10: true, 11: true, 12: true,
    13: true, 14: true, 15: true,
};

// Pocket positions
export const POCKETS = [
    { x: CUSHION_THICKNESS, y: CUSHION_THICKNESS, r: CORNER_POCKET_RADIUS },
    { x: TABLE_WIDTH / 2 + CUSHION_THICKNESS, y: CUSHION_THICKNESS - 2, r: SIDE_POCKET_RADIUS },
    { x: TABLE_WIDTH + CUSHION_THICKNESS, y: CUSHION_THICKNESS, r: CORNER_POCKET_RADIUS },
    { x: CUSHION_THICKNESS, y: TABLE_HEIGHT + CUSHION_THICKNESS, r: CORNER_POCKET_RADIUS },
    { x: TABLE_WIDTH / 2 + CUSHION_THICKNESS, y: TABLE_HEIGHT + CUSHION_THICKNESS + 2, r: SIDE_POCKET_RADIUS },
    { x: TABLE_WIDTH + CUSHION_THICKNESS, y: TABLE_HEIGHT + CUSHION_THICKNESS, r: CORNER_POCKET_RADIUS },
];

// Field boundaries
export const FIELD_LEFT = CUSHION_THICKNESS;
export const FIELD_RIGHT = TABLE_WIDTH + CUSHION_THICKNESS;
export const FIELD_TOP = CUSHION_THICKNESS;
export const FIELD_BOTTOM = TABLE_HEIGHT + CUSHION_THICKNESS;

// Rack position
export const RACK_X = FIELD_LEFT + (TABLE_WIDTH * 0.72);
export const RACK_Y = FIELD_TOP + TABLE_HEIGHT / 2;

// Break position
export const BREAK_X = FIELD_LEFT + TABLE_WIDTH * 0.25;
export const BREAK_Y = FIELD_TOP + TABLE_HEIGHT / 2;