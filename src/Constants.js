export const BLOCK = {
  AIR:        0,
  GRASS:      1,
  DIRT:       2,
  STONE:      3,
  BEDROCK:    4,
  WOOD:       5,
  LEAVES:     6,
  SAND:       7,
  GLASS:      8,
  WATER:            9,
  TALL_GRASS:       10,
  RAINFOREST_GRASS: 11,
  RAINFOREST_DIRT:  12,
  RAINFOREST_TALL_GRASS: 13,
  COAL_ORE:             14,
  SUGAR_CANE:           15,
  ROSE:                 16,
  LONG_GRASS:           17,
  SPARKLY_GRASS:       18,
};

export const BLOCK_NAMES = {
  [BLOCK.AIR]:              'Air',
  [BLOCK.GRASS]:            'Grass',
  [BLOCK.DIRT]:             'Dirt',
  [BLOCK.STONE]:            'Stone',
  [BLOCK.BEDROCK]:          'Bedrock',
  [BLOCK.WOOD]:             'Wood',
  [BLOCK.LEAVES]:           'Leaves',
  [BLOCK.SAND]:             'Sand',
  [BLOCK.GLASS]:            'Glass',
  [BLOCK.WATER]:            'Water',
  [BLOCK.TALL_GRASS]:       'Tall Grass',
  [BLOCK.RAINFOREST_GRASS]: 'Rainforest Grass',
  [BLOCK.RAINFOREST_DIRT]:  'Rainforest Dirt',
  [BLOCK.RAINFOREST_TALL_GRASS]: 'Rainforest Tall Grass',
  [BLOCK.COAL_ORE]:              'Coal Ore',
  [BLOCK.SUGAR_CANE]:             'Sugar Cane',
  [BLOCK.ROSE]:                   'Rose',
  [BLOCK.LONG_GRASS]:             'Long Grass',
  [BLOCK.SPARKLY_GRASS]:          'Sparkly Grass',
};

export const INDESTRUCTIBLE = new Set([BLOCK.BEDROCK, BLOCK.AIR]);

export const TRANSPARENT = new Set([BLOCK.AIR, BLOCK.WATER, BLOCK.LEAVES, BLOCK.TALL_GRASS, BLOCK.RAINFOREST_TALL_GRASS, BLOCK.LONG_GRASS, BLOCK.SPARKLY_GRASS, BLOCK.SUGAR_CANE, BLOCK.ROSE]);

export const PASSABLE = new Set([BLOCK.AIR, BLOCK.WATER, BLOCK.TALL_GRASS, BLOCK.RAINFOREST_TALL_GRASS, BLOCK.LONG_GRASS, BLOCK.SPARKLY_GRASS, BLOCK.SUGAR_CANE, BLOCK.ROSE]);

export const BREAK_TIME = {
  [BLOCK.GRASS]:      800,
  [BLOCK.DIRT]:       700,
  [BLOCK.STONE]:     1500,
  [BLOCK.BEDROCK]:   Infinity,
  [BLOCK.WOOD]:      1200,
  [BLOCK.LEAVES]:     300,
  [BLOCK.SAND]:       600,
  [BLOCK.GLASS]:      400,
  [BLOCK.WATER]:     Infinity,
  [BLOCK.TALL_GRASS]:       100,
  [BLOCK.RAINFOREST_TALL_GRASS]: 100,
  [BLOCK.RAINFOREST_GRASS]:  800,
  [BLOCK.RAINFOREST_DIRT]:   700,
  [BLOCK.COAL_ORE]:         1500,
  [BLOCK.SUGAR_CANE]:       100,
  [BLOCK.ROSE]:             80,
  [BLOCK.LONG_GRASS]:       120,
  [BLOCK.SPARKLY_GRASS]:    100,
};

export const BLOCK_COLORS = {
  [BLOCK.GRASS]: {
    top:    [0.40, 0.75, 0.22],
    side:   [0.35, 0.65, 0.18],
    bottom: [0.58, 0.38, 0.16],
  },
  [BLOCK.DIRT]: {
    all:    [0.58, 0.38, 0.16],
  },
  [BLOCK.STONE]: {
    top:    [0.60, 0.52, 0.38],
    side:   [0.55, 0.46, 0.32],
    bottom: [0.48, 0.40, 0.28],
  },
  [BLOCK.BEDROCK]: {
    all:    [0.15, 0.12, 0.10],
  },
  [BLOCK.WOOD]: {
    top:    [0.40, 0.24, 0.10],
    side:   [0.45, 0.28, 0.12],
    bottom: [0.40, 0.24, 0.10],
  },
  [BLOCK.LEAVES]: {
    top:    [0.20, 0.58, 0.15],
    side:   [0.16, 0.50, 0.12],
    bottom: [0.14, 0.44, 0.10],
  },
  [BLOCK.SAND]: {
    top:    [0.92, 0.80, 0.38],
    side:   [0.85, 0.72, 0.30],
    bottom: [0.78, 0.64, 0.24],
  },
  [BLOCK.GLASS]: {
    all:    [0.82, 0.94, 0.98],
  },
  [BLOCK.WATER]: {
    top:    [0.40, 0.72, 0.95],
    side:   [0.34, 0.64, 0.88],
    bottom: [0.28, 0.56, 0.80],
  },
  [BLOCK.TALL_GRASS]: {
    all:    [0.42, 0.78, 0.24],
  },
  [BLOCK.RAINFOREST_GRASS]: {
    top:    [0.22, 0.52, 0.18],
    side:   [0.18, 0.44, 0.14],
    bottom: [0.32, 0.22, 0.12],
  },
  [BLOCK.RAINFOREST_DIRT]: {
    all:    [0.38, 0.26, 0.14],
  },
  [BLOCK.RAINFOREST_TALL_GRASS]: {
    all:    [0.18, 0.48, 0.14],
  },
  [BLOCK.COAL_ORE]: {
    top:    [0.24, 0.24, 0.23],
    side:   [0.20, 0.20, 0.19],
    bottom: [0.16, 0.16, 0.15],
  },
  [BLOCK.SUGAR_CANE]: {
    all:    [0.45, 0.72, 0.35],
  },
  [BLOCK.ROSE]: {
    stem:   [0.16, 0.42, 0.10],
    flower: [0.88, 0.18, 0.22],
  },
  [BLOCK.LONG_GRASS]: {
    all:    [0.28, 0.62, 0.18],
  },
  [BLOCK.SPARKLY_GRASS]: {
    all: [0.42, 0.78, 0.24],
  },
};

export const AO_STRENGTH = 0.12;

export const CHUNK_WIDTH    = 16;
export const CHUNK_HEIGHT   = 128;
export const RENDER_DISTANCE = 8;

export const WATER_LEVEL = 42;
export const BEDROCK_Y   = 0;

export const TERRAIN = {
  BASE_HEIGHT:     48,
  HEIGHT_VARIANCE: 24,
  CAVE_MAX_Y:      55,
};

export const PLAYER = {
  WIDTH:          0.6,
  HEIGHT:         1.8,
  EYE_HEIGHT:     1.62,
  WALK_SPEED:     4.3,
  SPRINT_SPEED:   7.0,
  BOOST_SPEED:   11.0,
  SNEAK_SPEED:    1.3,
  SWIM_SPEED:     2.5,
  JUMP_FORCE:     8.0,
  GRAVITY:        -28.0,
  WATER_GRAVITY:  -4.0,
  REACH:          5.0,
  FOV_NORMAL:     75,
  FOV_SPRINT:     85,
  FOV_BOOST:      88,
  FOV_SNEAK:      70,
  DOUBLE_TAP_MS:  350,
  HEAD_BOB_SPEED: 8.0,
  HEAD_BOB_AMP:   0.04,
  PITCH_MIN:             -Math.PI / 2 + 0.05,
  PITCH_MAX:              Math.PI / 2 - 0.05,
  MOUSE_SENSITIVITY:      0.002,
};

export const DAY_CYCLE = {
  DURATION_MS: 1200000,
};

export const SKY_COLORS = [
  { t: 0.00, color: [0.002, 0.002, 0.008] },
  { t: 0.20, color: [0.002, 0.002, 0.008] },
  { t: 0.25, color: [0.98, 0.72, 0.42] },
  { t: 0.30, color: [0.56, 0.82, 0.96] },
  { t: 0.50, color: [0.48, 0.76, 0.94] },
  { t: 0.70, color: [0.56, 0.82, 0.96] },
  { t: 0.75, color: [0.98, 0.60, 0.28] },
  { t: 0.80, color: [0.002, 0.002, 0.008] },
  { t: 1.00, color: [0.002, 0.002, 0.008] },
];

export const HOTBAR_BLOCKS = [
  BLOCK.AIR, BLOCK.AIR, BLOCK.AIR, BLOCK.AIR, BLOCK.AIR, BLOCK.AIR, BLOCK.AIR, BLOCK.AIR, BLOCK.AIR,
];

export const KEYS = {
  FORWARD:    'KeyW',
  BACKWARD:   'KeyS',
  LEFT:       'KeyA',
  RIGHT:      'KeyD',
  JUMP:       'Space',
  SNEAK:      'ShiftLeft',
  SPRINT:     'ControlLeft',
  FLY:        'KeyF',
  NIGHT_MODE: 'KeyN',
  TOGGLE_DAY_NIGHT: 'KeyT',
};

export const FOG = {
  DAY_DENSITY:   0.006,
  NIGHT_DENSITY: 0.04,
};
