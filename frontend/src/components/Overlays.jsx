import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { OPERATOR_BINS, fmt } from '../lib/scales.js';
import { latencySnapshot, subscribeLatency } from '../api/latency.js';
import { API_MODE, API_BASE } from '../api/client.js';

export function Legend({ heightMode, res }) {
  return (
    <div className="overlay p-3 w-60">
      <div className="label mb-2">Operators competing in a cell</div>
      <div className="flex gap-[2px]">
        {OPERATOR_BINS.map((b) => (
          <div key={b.label} className="flex-1">
            <div className="h-2.5 first:rounded-l-sm" style={{ background: b.color, boxShadow: 'inset 0 0 0 1px rgba(23,33,43,0.08)' }} />
            <div className="text-xs text-muted mt-1 tabular">{b.label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-2 leading-snug">
        Height shows {heightMode === 'operators' ? 'competing operators' : 'distinct places'}, square-root scaled. Cells
        are H3 resolution {res} and get finer as you zoom in.
      </p>
    </div>
  );
}

export function KpiTile() {
  const [snap, setSnap] = useState(latencySnapshot);
  useEffect(() => subscribeLatency(() => setSnap(latencySnapshot())), []);
  const live = API_MODE === 'live';
  const ms = (v) => (v == null ? '–' : v < 10 ? v.toFixed(1) : Math.round(v));
  return (
    <div className="overlay px-3.5 py-2.5 flex items-end gap-4" title={`Source: ${API_BASE}`}>
      <div>
        <div className="text-xs text-muted semi mb-1">API latency, p95</div>
        <div className="readout text-[22px]">
          {ms(snap.p95)}
          <span className="text-xs font-medium text-muted ml-0.5" style={{ fontStretch: '100%' }}>
            ms
          </span>
        </div>
      </div>
      <div className="text-xs text-muted leading-snug pb-px">
        <div>
          p50 <span className="text-ink tabular">{ms(snap.p50)} ms</span>
        </div>
        <div>over {snap.count} calls</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-600' : 'bg-faint'}`} />
          <span className="text-ink">{live ? 'Live API' : 'Mock data'}</span>
        </div>
      </div>
    </div>
  );
}

export function DensestCells({ cells, selectedH3, onPick }) {
  return (
    <div className="overlay p-3 w-72">
      <h2 className="label mb-1.5">Densest cells worldwide</h2>
      {!cells && <div className="text-xs text-muted py-2">Ranking cells…</div>}
      {cells && cells.length === 0 && <div className="text-xs text-muted py-2">No records match the filters.</div>}
      <ol className="divide-y divide-rule">
        {cells?.map((c, i) => (
          <li key={c.h3}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className={`w-full flex items-baseline gap-2.5 py-1.5 text-left ${c.h3 === selectedH3 ? 'text-ink' : 'hover:bg-ground'}`}
            >
              <span className="text-xs text-faint tabular w-3">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm truncate ${c.h3 === selectedH3 ? 'font-bold' : 'font-medium'}`}>
                  {c.place || c.h3}
                  {c.h3 === selectedH3 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-select ml-1.5 align-middle" />}
                </span>
                <span className="block text-xs text-muted truncate">
                  led by {c.topOperator}, {c.operators} operator{c.operators === 1 ? '' : 's'}
                </span>
              </span>
              <span className="text-sm font-semibold tabular">{fmt(c.records)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ResetViewButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="overlay px-3 py-2 flex items-center gap-1.5 text-sm font-medium semi hover:bg-ground"
    >
      <RotateCcw className="w-3.5 h-3.5" /> Reset view
    </button>
  );
}
