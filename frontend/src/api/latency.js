// Rolling window of request durations for the live KPI tile.
const WINDOW = 50;
const samples = [];
const listeners = new Set();

export function recordLatency(name, ms) {
  samples.push({ name, ms, at: Date.now() });
  if (samples.length > WINDOW) samples.shift();
  listeners.forEach((fn) => fn());
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function latencySnapshot() {
  const ms = samples.map((s) => s.ms);
  return { count: ms.length, p50: percentile(ms, 50), p95: percentile(ms, 95), samples: [...samples] };
}

export function subscribeLatency(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
