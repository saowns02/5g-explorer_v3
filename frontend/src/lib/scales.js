// Visual encodings shared by the globe, legend and panels.

// Colour = number of competing operators in the cell (ordinal, one hue).
// Validated as an ordinal ramp on a dark surface: monotone lightness,
// visible step gaps, darkest step clears 3:1 against the globe.
// Brighter = more operators competing.
export const OPERATOR_BINS = [
  { min: 1, max: 1, label: '1', color: '#d9622b' },
  { min: 2, max: 2, label: '2', color: '#f08a4b' },
  { min: 3, max: 3, label: '3', color: '#f5ab78' },
  { min: 4, max: 4, label: '4', color: '#f9cba8' },
  { min: 5, max: Infinity, label: '5+', color: '#fde8d6' },
];

export const SELECTED_COLOR = '#38bdf8';

export function operatorColor(n) {
  const bin = OPERATOR_BINS.find((b) => n >= b.min && n <= b.max);
  return bin ? bin.color : OPERATOR_BINS[0].color;
}

// Column heights use a square-root scale: reporting is extremely uneven
// (France lists every commune), so a linear scale would flatten the rest
// of the world to nothing.
// Heights are fractions of the globe radius, so the tallest column shrinks
// as the camera moves in (finer resolution) to stay readable up close.
export const MAX_ALTITUDE_BY_RES = { 2: 0.32, 3: 0.16, 4: 0.07 };
export const MIN_ALTITUDE = 0.004;

export function altitudeScale(value, max, res = 2) {
  if (!max || value <= 0) return MIN_ALTITUDE;
  const top = MAX_ALTITUDE_BY_RES[res] ?? MAX_ALTITUDE_BY_RES[2];
  return MIN_ALTITUDE + Math.sqrt(value / max) * top;
}

// Pick an H3 resolution from the camera altitude so the number of cells
// stays manageable when zoomed out and detail appears when zoomed in.
export function resolutionForAltitude(altitude) {
  if (altitude > 2.0) return 2;
  if (altitude > 0.9) return 3;
  return 4;
}

const nf = new Intl.NumberFormat('en-GB');
export const fmt = (n) => nf.format(Math.round(n));

export function fmtCompact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function fmtPct(x) {
  if (x >= 0.995) return '100%';
  if (x < 0.01) return '<1%';
  return `${Math.round(x * 100)}%`;
}
