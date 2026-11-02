// Helpers shared by the place panel and the compare view.

export function fmtCoord(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export const RADII = [10, 25, 50];

// Categorical colours for operators, in fixed order (validated palette:
// blue, orange, aqua, yellow, magenta). Anything past five folds into Other.
export const OPERATOR_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
export const OTHER_COLOR = '#94a3b8';
export const MAX_NAMED = OPERATOR_PALETTE.length;

// Give each operator a colour that stays the same in every chart of a view.
// The top operators by combined records across all the places get the
// palette, in order; the rest share the Other colour.
export function operatorColours(...nearbyLists) {
  const totals = new Map();
  for (const list of nearbyLists) {
    for (const o of list ?? []) totals.set(o.name, (totals.get(o.name) || 0) + o.records);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([n]) => n);
  const colours = new Map();
  ranked.forEach((name, i) => colours.set(name, i < MAX_NAMED ? OPERATOR_PALETTE[i] : OTHER_COLOR));
  return { colours, named: ranked.slice(0, MAX_NAMED), ranked };
}

// Slices for a donut: the named operators in their fixed order, then Other.
export function shareSlices(operators, named, colours) {
  const total = operators.reduce((s, o) => s + o.records, 0);
  const by = new Map(operators.map((o) => [o.name, o.records]));
  const slices = named
    .filter((n) => by.get(n))
    .map((n) => ({ name: n, records: by.get(n), share: by.get(n) / total, color: colours.get(n) }));
  const rest = total - slices.reduce((s, x) => s + x.records, 0);
  if (rest > 0) slices.push({ name: 'Other', records: rest, share: rest / total, color: OTHER_COLOR });
  return { total, slices };
}

// Operators present at A only, at both, at B only.
export function overlap(a = [], b = []) {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    onlyA: a.filter((o) => !sb.has(o)),
    both: a.filter((o) => sb.has(o)),
    onlyB: b.filter((o) => !sa.has(o)),
  };
}
