// Single entry point for data. Every call is timed so the KPI tile can
// report p50/p95 latency for whichever backend is active.
//
// API contract (FastAPI, base = VITE_API_URL):
//   GET /health                                   -> { status }
//   GET /meta                                     -> { totals, operators[], statuses[] }
//   GET /hexes?res=&operators=&statuses=          -> { res, totals, hexes[] }
//   GET /cells/{h3}?res=&operators=&statuses=     -> { h3, records, locations, operators[], statuses[], places[] }
//   GET /top-cells?res=&operators=&statuses=&limit= -> [{ h3, lat, lng, records, ..., place, topOperator }]
//   GET /places?q=&limit=                         -> [{ id, name, lat, lng, records, operators, topOperators }]
//   GET /places/{id}?km=                          -> { id, name, lat, lng, atPlace{...}, nearby{...} }
// List params are comma separated; operator names are URL encoded.
import * as mock from './mock.js';
import { recordLatency } from './latency.js';

const BASE = import.meta.env.VITE_API_URL;
export const API_MODE = BASE ? 'live' : 'mock';
export const API_BASE = BASE || 'in-browser mock';

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.length) u.set(k, v.join(','));
    } else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

// Network time from the Resource Timing API. Unlike a stopwatch around
// fetch(), it is not inflated when the main thread is busy drawing the globe.
function networkTime(url) {
  const abs = new URL(url, window.location.href).href;
  const entries = performance.getEntriesByName(abs);
  const e = entries[entries.length - 1];
  return e && e.responseEnd > 0 ? e.responseEnd - e.startTime : null;
}

async function getJSON(path, params = {}) {
  const url = `${BASE}${path}${qs(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const body = await res.json();
  return { body, ms: networkTime(url) };
}

// In mock mode the dataset download is a one-off cost a real server pays at
// startup, so it is excluded from the timings to keep the KPI comparable.
async function timed(name, fn) {
  if (!BASE) await mock.ready();
  const t0 = performance.now();
  const out = await fn();
  if (BASE) {
    recordLatency(name, out.ms ?? performance.now() - t0);
    return out.body;
  }
  recordLatency(name, performance.now() - t0);
  return out;
}

export const api = {
  health: () => timed('health', () => (BASE ? getJSON('/health') : mock.health())),
  meta: () => timed('meta', () => (BASE ? getJSON('/meta') : mock.getMeta())),
  hexes: (p) => timed('hexes', () => (BASE ? getJSON('/hexes', p) : mock.getHexes(p))),
  cell: (h3, p) =>
    timed('cell', () => (BASE ? getJSON(`/cells/${h3}`, p) : mock.getCell(h3, p))),
  topCells: (p) => timed('top', () => (BASE ? getJSON('/top-cells', p) : mock.getTopCells(p))),
  searchPlaces: (p) => timed('places', () => (BASE ? getJSON('/places', p) : mock.searchPlaces(p))),
  place: (id, p) => timed('place', () => (BASE ? getJSON(`/places/${id}`, p) : mock.getPlace(id, p))),
};
