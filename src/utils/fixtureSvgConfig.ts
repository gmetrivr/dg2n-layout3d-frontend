// Single global multiplier applied to ALL fixture SVGs equally
export const FIXTURE_SVG_SCALE = 1.0;

// Pixels-to-meters conversion for SVG viewBox dimensions
const PX_TO_M = 1 / 1000;

// Map fixture type → SVG file path (files named by block name in public/fixture_svg/)
export const FIXTURE_SVG_PATHS: Record<string, string> = {
  '4-WAY':           '/fixture_svg/RTL-4W.svg',
  'A-RAIL':          '/fixture_svg/RTL-SR.svg',
  'H-GONDOLA':       '/fixture_svg/RTL-HG.svg',
  'NESTED-TABLE':    '/fixture_svg/RTL-NT.svg',
  'ACC-GONDOLA':     '/fixture_svg/RTL-AG.svg',
  'IMPULSE':         '/fixture_svg/RTL-IF.svg',
  'WALL-BAY':        '/fixture_svg/RTL-WPS.svg',
  'GLASS-TABLE':     '/fixture_svg/TJR-NT.svg',
  'DEFAULT':         '/fixture_svg/RTL-4W.svg',
};

// Per-fixture-type size in world units [width, height] derived from SVG viewBox dimensions.
// Each SVG has its own aspect ratio; PX_TO_M * FIXTURE_SVG_SCALE maps to meters on canvas.
export const FIXTURE_SVG_SIZES: Record<string, [number, number]> = {
  '4-WAY':           [1100 * PX_TO_M, 1100 * PX_TO_M],   // ~0.42 x 0.42
  'A-RAIL':          [1200 * PX_TO_M, 850 * PX_TO_M],  // ~1.20 x 0.85
  'H-GONDOLA':       [2300 * PX_TO_M, 1022 * PX_TO_M],   // ~0.76 x 0.28
  'NESTED-TABLE':    [1500 * PX_TO_M, 1200 * PX_TO_M], // ~1.50 x 1.20
  'ACC-GONDOLA':     [750 * PX_TO_M, 750 * PX_TO_M],   // ~0.29 x 0.28
  'IMPULSE':         [1200 * PX_TO_M, 525 * PX_TO_M],
  'WALL-BAY':        [600 * PX_TO_M, 425 * PX_TO_M],   // ~0.60 x 0.43
  'GLASS-TABLE':     [549 * PX_TO_M, 561 * PX_TO_M],   // ~0.55 x 0.56
  'DEFAULT':         [418 * PX_TO_M, 417 * PX_TO_M],
};

// Per-fixture-type origin offset in world units (meters).
// The 3D models have their origin at a corner/edge, but SVGs are placed at center.
// These offsets shift the SVG so it aligns with where the 3D model actually sits.
// [offsetX, offsetY] — applied BEFORE rotation, in the fixture's local space.
export const FIXTURE_OFFSETS: Record<string, [number, number]> = {
  '4-WAY':           [0, 0],
  'A-RAIL':          [0, 0],
  'H-GONDOLA':       [0, 0],
  'NESTED-TABLE':    [0, 0],
  'ACC-GONDOLA':     [0, 0],
  'IMPULSE-FIXTURE': [0, 0],
  'IMPULSE':         [0, 0],
  'WALL-BAY':        [0, 0.28],
  'GLASS-TABLE':     [0, 0],
  'DEFAULT':         [0, 0],
};

export function getFixtureSvgPath(fixtureType: string): string {
  return FIXTURE_SVG_PATHS[fixtureType.toUpperCase()] || FIXTURE_SVG_PATHS['DEFAULT'];
}

export function getFixtureSize(fixtureType: string): [number, number] {
  const [w, h] = FIXTURE_SVG_SIZES[fixtureType.toUpperCase()] || FIXTURE_SVG_SIZES['DEFAULT'];
  return [w * FIXTURE_SVG_SCALE, h * FIXTURE_SVG_SCALE];
}

export function getFixtureOffset(fixtureType: string): [number, number] {
  return FIXTURE_OFFSETS[fixtureType.toUpperCase()] || FIXTURE_OFFSETS['DEFAULT'];
}
