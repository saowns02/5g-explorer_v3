// In-browser implementation of the API contract. It reads the ETL export
// (public/data/points.json) and aggregates into H3 cells, returning exactly
// the shapes the FastAPI service will return. Swap to the live API by
// setting VITE_API_URL; nothing else in the app changes.
import { latLngToCell, cellToLatLng } from 'h3-js';

let datasetPromise = null;
const cellCache = new Map(); // res -> string[] (cell per record)
let placeIndex = null; // built on first place search

function loadDataset() {
  if (!datasetPromise) {
    const url = `${import.meta.env.BASE_URL}data/points.json`;
    datasetPromise = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
      return r.json();
    });
  }
  return datasetPromise;
}

export const ready = () => loadDataset();

// Exposed for tests.
export function _setDataset(data) {
  datasetPromise = Promise.resolve(data);
  cellCache.clear();
  placeIndex = null;
}

function cellsFor(ds, res) {
  if (!cellCache.has(res)) {
    const out = new Array(ds.lat.length);
    for (let i = 0; i < ds.lat.length; i++) out[i] = latLngToCell(ds.lat[i], ds.lng[i], res);
    cellCache.set(res, out);
  }
  return cellCache.get(res);
}

function makeFilter(ds, { operators = [], statuses = [] }) {
  const opSet = operators.length ? new Set(operators) : null;
  const stSet = statuses.length ? new Set(statuses.map((s) => ds.statuses.indexOf(s))) : null;
  return (i) => (!opSet || opSet.has(ds.operators[ds.op[i]])) && (!stSet || stSet.has(ds.st[i]));
}

const coordKey = (ds, i) => `${ds.lat[i]},${ds.lng[i]}`;

export async function getMeta() {
  const ds = await loadDataset();
  const opCounts = new Array(ds.operators.length).fill(0);
  const stCounts = new Array(ds.statuses.length).fill(0);
  const coords = new Set();
  for (let i = 0; i < ds.lat.length; i++) {
    opCounts[ds.op[i]]++;
    stCounts[ds.st[i]]++;
    coords.add(coordKey(ds, i));
  }
  return {
    totals: { records: ds.lat.length, operators: ds.operators.length, locations: coords.size },
    operators: ds.operators.map((name, i) => ({ name, records: opCounts[i] })),
    statuses: ds.statuses.map((name, i) => ({ name, records: stCounts[i] })),
  };
}

export async function getHexes({ res = 3, operators = [], statuses = [] } = {}) {
  const ds = await loadDataset();
  const cells = cellsFor(ds, res);
  const keep = makeFilter(ds, { operators, statuses });
  const agg = new Map();
  const allCoords = new Set();
  const allOps = new Set();
  let total = 0;
  for (let i = 0; i < cells.length; i++) {
    if (!keep(i)) continue;
    total++;
    const key = coordKey(ds, i);
    allCoords.add(key);
    allOps.add(ds.op[i]);
    let c = agg.get(cells[i]);
    if (!c) {
      c = { records: 0, coords: new Set(), ops: new Set() };
      agg.set(cells[i], c);
    }
    c.records++;
    c.coords.add(key);
    c.ops.add(ds.op[i]);
  }
  const hexes = [];
  for (const [h3, c] of agg) {
    const [lat, lng] = cellToLatLng(h3);
    hexes.push({ h3, lat, lng, records: c.records, locations: c.coords.size, operators: c.ops.size });
  }
  return {
    res,
    totals: { records: total, operators: allOps.size, locations: allCoords.size, cells: hexes.length },
    hexes,
  };
}

export async function getCell(h3, { res = 3, operators = [], statuses = [] } = {}) {
  const ds = await loadDataset();
  const cells = cellsFor(ds, res);
  const keep = makeFilter(ds, { operators, statuses });
  const opCounts = new Map();
  const stCounts = new Map();
  const placeCounts = new Map();
  const coords = new Set();
  let records = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== h3 || !keep(i)) continue;
    records++;
    coords.add(coordKey(ds, i));
    const op = ds.operators[ds.op[i]];
    const st = ds.statuses[ds.st[i]];
    const pl = ds.places[ds.pl[i]];
    opCounts.set(op, (opCounts.get(op) || 0) + 1);
    stCounts.set(st, (stCounts.get(st) || 0) + 1);
    placeCounts.set(pl, (placeCounts.get(pl) || 0) + 1);
  }
  const [lat, lng] = cellToLatLng(h3);
  const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    h3,
    res,
    lat,
    lng,
    records,
    locations: coords.size,
    operators: sortDesc(opCounts).map(([name, n]) => ({ name, records: n, share: n / records })),
    statuses: sortDesc(stCounts).map(([name, n]) => ({ name, records: n })),
    places: sortDesc(placeCounts).slice(0, 8).map(([name, n]) => ({ name, records: n })),
    placeCount: placeCounts.size,
  };
}

export async function getTopCells({ res = 3, operators = [], statuses = [], limit = 5 } = {}) {
  const { hexes } = await getHexes({ res, operators, statuses });
  const top = [...hexes].sort((a, b) => b.records - a.records).slice(0, limit);
  // Label each cell with its most reported place and leading operator.
  return Promise.all(
    top.map(async (h) => {
      const cell = await getCell(h.h3, { res, operators, statuses });
      return { ...h, place: cell.places[0]?.name ?? '', topOperator: cell.operators[0]?.name ?? '' };
    }),
  );
}

export async function health() {
  await loadDataset();
  return { status: 'ok', mode: 'mock' };
}

// ---------- places (same rules as db/load.py) ----------

// Lower case without accents. Must match search_key() in db/load.py.
export function searchKey(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// A place = one accent-free name inside one H3 resolution-3 cell; its id is
// the 1-based row number of its first record, as in the database.
function buildPlaces(ds) {
  if (placeIndex) return placeIndex;
  const cells = cellsFor(ds, 3);
  const keyCache = new Map();
  const byKey = new Map();
  const placeOf = new Int32Array(ds.lat.length);
  const list = [];
  for (let i = 0; i < ds.lat.length; i++) {
    const name = ds.places[ds.pl[i]];
    let key = keyCache.get(name);
    if (key === undefined) {
      key = searchKey(name);
      keyCache.set(name, key);
    }
    const k = `${key}|${cells[i]}`;
    let p = byKey.get(k);
    if (!p) {
      p = { id: i + 1, name, key, latSum: 0, lngSum: 0, records: 0, ops: new Set(), rows: [] };
      byKey.set(k, p);
      list.push(p);
    }
    p.latSum += ds.lat[i];
    p.lngSum += ds.lng[i];
    p.records++;
    p.ops.add(ds.operators[ds.op[i]]);
    p.rows.push(i);
    placeOf[i] = p.id;
  }
  const byId = new Map();
  for (const p of list) {
    p.lat = p.latSum / p.records;
    p.lng = p.lngSum / p.records;
    p.operators = [...p.ops].sort();
    byId.set(p.id, p);
  }
  placeIndex = { list, byId, placeOf };
  return placeIndex;
}

export async function searchPlaces({ q, limit = 8 }) {
  const ds = await loadDataset();
  const key = searchKey(q || '');
  if (key.length < 2) return [];
  const { list } = buildPlaces(ds);
  const rank = (p) => (p.key === key ? 0 : p.key.startsWith(key) ? 1 : 2);
  return list
    .filter((p) => p.key.includes(key))
    .sort((a, b) => rank(a) - rank(b) || b.records - a.records || a.id - b.id)
    .slice(0, limit)
    .map((p) => ({
      id: p.id, name: p.name, lat: p.lat, lng: p.lng, records: p.records,
      operators: p.operators.length, topOperators: p.operators.slice(0, 3),
    }));
}

const EARTH_KM = 6371.0088;
function haversineKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const countDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

export async function getPlace(id, { km = 25 } = {}) {
  const ds = await loadDataset();
  const { byId, placeOf } = buildPlaces(ds);
  const p = byId.get(Number(id));
  if (!p) throw new Error(`No place with id ${id}`);
  const atStatus = new Map();
  for (const i of p.rows) {
    const st = ds.statuses[ds.st[i]];
    atStatus.set(st, (atStatus.get(st) || 0) + 1);
  }
  const ops = new Map();
  const sts = new Map();
  const coords = new Set();
  const places = new Set();
  let records = 0;
  // Cheap box test before the exact distance.
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
  for (let i = 0; i < ds.lat.length; i++) {
    if (Math.abs(ds.lat[i] - p.lat) > dLat) continue;
    let dl = Math.abs(ds.lng[i] - p.lng);
    if (dl > 180) dl = 360 - dl;
    if (dl > dLng) continue;
    if (haversineKm(p.lat, p.lng, ds.lat[i], ds.lng[i]) > km) continue;
    records++;
    const op = ds.operators[ds.op[i]];
    const st = ds.statuses[ds.st[i]];
    ops.set(op, (ops.get(op) || 0) + 1);
    sts.set(st, (sts.get(st) || 0) + 1);
    coords.add(coordKey(ds, i));
    places.add(placeOf[i]);
  }
  return {
    id: p.id, name: p.name, lat: p.lat, lng: p.lng,
    atPlace: {
      records: p.records,
      operators: p.operators,
      statuses: countDesc(atStatus).map(([name, n]) => ({ name, records: n })),
    },
    nearby: {
      km,
      records,
      locations: coords.size,
      places: places.size,
      operators: countDesc(ops).map(([name, n]) => ({ name, records: n, share: records ? n / records : 0 })),
      statuses: countDesc(sts).map(([name, n]) => ({ name, records: n })),
    },
  };
}
