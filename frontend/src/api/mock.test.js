import { describe, it, expect, beforeEach } from 'vitest';
import { latLngToCell } from 'h3-js';
import * as mock from './mock.js';
import { percentile } from './latency.js';
import { operatorColor, altitudeScale, resolutionForAltitude } from '../lib/scales.js';

// Two London points (same cell), one Paris point; two operators, two statuses.
const fixture = {
  operators: ['EE', 'Orange'],
  statuses: ['Commercial', 'Pre-release', 'Limited'],
  places: ['London', 'Paris'],
  lat: [51.5072, 51.5072, 48.8566],
  lng: [-0.1276, -0.1276, 2.3522],
  op: [0, 1, 1],
  st: [0, 0, 1],
  pl: [0, 0, 1],
};

describe('mock API', () => {
  beforeEach(() => mock._setDataset(fixture));

  it('reports dataset totals', async () => {
    const meta = await mock.getMeta();
    expect(meta.totals).toEqual({ records: 3, operators: 2, locations: 2 });
  });

  it('aggregates records into H3 cells', async () => {
    const { hexes, totals } = await mock.getHexes({ res: 3 });
    expect(hexes).toHaveLength(2);
    const london = hexes.find((h) => h.h3 === latLngToCell(51.5072, -0.1276, 3));
    expect(london).toMatchObject({ records: 2, locations: 1, operators: 2 });
    expect(totals.records).toBe(3);
  });

  it('applies operator and status filters', async () => {
    const byOp = await mock.getHexes({ res: 3, operators: ['EE'] });
    expect(byOp.totals.records).toBe(1);
    const byStatus = await mock.getHexes({ res: 3, statuses: ['Pre-release'] });
    expect(byStatus.hexes).toHaveLength(1);
    expect(byStatus.totals.operators).toBe(1);
  });

  it('returns operator share for a cell', async () => {
    const h3 = latLngToCell(51.5072, -0.1276, 3);
    const cell = await mock.getCell(h3, { res: 3 });
    expect(cell.records).toBe(2);
    expect(cell.operators.map((o) => o.share)).toEqual([0.5, 0.5]);
    expect(cell.places[0].name).toBe('London');
  });
});

describe('mock places', () => {
  const places = {
    operators: ['EE', 'O2', 'Salt', 'Swisscom', 'Bell'],
    statuses: ['Commercial', 'Pre-release', 'Limited'],
    places: ['London', 'Croydon', 'Zürich', 'Zurich'],
    lat: [51.5072, 51.5072, 51.3762, 47.3769, 47.378, 43.4215],
    lng: [-0.1276, -0.1276, -0.0982, 8.5417, 8.54, -81.6257],
    op: [0, 1, 0, 3, 2, 4],
    st: [0, 0, 1, 0, 0, 0],
    pl: [0, 0, 1, 2, 3, 3],
  };
  beforeEach(() => mock._setDataset(places));

  it('strips accents and case', () => {
    expect(mock.searchKey('São Paulo ')).toBe('sao paulo');
  });

  it('merges spellings in one area and keeps distant namesakes apart', async () => {
    const rows = await mock.searchPlaces({ q: 'zurich' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 4, operators: 2 });
  });

  it('reports the place and its surroundings', async () => {
    const near = await mock.getPlace(1, { km: 5 });
    expect(near.atPlace.operators).toEqual(['EE', 'O2']);
    expect(near.nearby.records).toBe(2);
    const wide = await mock.getPlace(1, { km: 25 });
    expect(wide.nearby).toMatchObject({ records: 3, places: 2 });
  });
});

describe('scales', () => {
  it('bins operator counts', () => {
    expect(operatorColor(1)).not.toBe(operatorColor(5));
    expect(operatorColor(9)).toBe(operatorColor(5));
  });
  it('scales altitude monotonically', () => {
    expect(altitudeScale(100, 100)).toBeGreaterThan(altitudeScale(10, 100));
  });
  it('picks finer resolution when zoomed in', () => {
    expect(resolutionForAltitude(2.5)).toBeLessThan(resolutionForAltitude(0.5));
  });
  it('computes p95', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100], 95)).toBe(19);
  });
});
