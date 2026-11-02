import { X, MapPin } from 'lucide-react';
import { fmt, fmtPct, operatorColor } from '../lib/scales.js';
import { fmtCoord } from '../lib/places.js';

const SHOW_OPERATORS = 10;

export function PanelShell({ kicker, title, sub, onClose, loading, children, label }) {
  return (
    <aside
      className="absolute lg:static inset-y-0 right-0 w-full sm:w-[24rem] bg-panel border-l border-rule z-30 flex flex-col shadow-xl lg:shadow-none"
      aria-label={label}
    >
      <header className="px-6 pt-5 pb-4 border-b border-rule">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted semi">{kicker}</p>
            <h2 className="wide font-extrabold text-[22px] leading-tight mt-1 truncate">{title}</h2>
            {sub && <p className="text-xs text-muted mt-1 tabular">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded text-muted hover:text-ink hover:bg-ground"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>
      <div className={`flex-1 overflow-y-auto scroll-thin px-6 py-5 space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {children}
      </div>
    </aside>
  );
}

export function ReadoutRow({ items }) {
  return (
    <dl className="grid border-y border-rule divide-x divide-rule" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(([label, v]) => (
        <div key={label} className="py-2.5 px-3 first:pl-0">
          <dt className="sr-only">{label}</dt>
          <dd className="readout text-xl">{fmt(v)}</dd>
          <dd className="text-xs text-muted mt-1 semi">{label}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function DetailPanel({ cell, loading, onClose }) {
  if (!cell && !loading) return null;
  const ops = cell?.operators ?? [];
  const shown = ops.slice(0, SHOW_OPERATORS);
  const rest = ops.slice(SHOW_OPERATORS);
  const restShare = rest.reduce((s, o) => s + o.share, 0);

  return (
    <PanelShell
      label="Cell detail"
      kicker={`Hexagon at H3 resolution ${cell?.res ?? ''}`}
      title={cell?.places?.[0]?.name ?? 'Loading…'}
      sub={cell ? `${fmtCoord(cell.lat, cell.lng)}, cell ${cell.h3}` : null}
      onClose={onClose}
      loading={loading}
    >
      {cell && (
        <>
          <ReadoutRow items={[['records', cell.records], ['locations', cell.locations], ['operators', ops.length]]} />

          <section>
            <div className="flex items-baseline justify-between mb-2.5">
              <h3 className="label">Share of records by operator</h3>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: operatorColor(ops.length) }} />
                globe colour
              </span>
            </div>
            <ul className="space-y-2">
              {shown.map((o) => (
                <li key={o.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium truncate pr-2">{o.name}</span>
                    <span className="text-muted tabular whitespace-nowrap">
                      {fmt(o.records)} <span className="text-ink font-semibold ml-1">{fmtPct(o.share)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-ground rounded-sm overflow-hidden">
                    <div className="h-full bg-ink rounded-sm" style={{ width: `${Math.max(1.5, o.share * 100)}%` }} />
                  </div>
                </li>
              ))}
              {rest.length > 0 && (
                <li className="text-xs text-muted">
                  {rest.length} more operators hold {fmtPct(restShare)} of records.
                </li>
              )}
            </ul>
          </section>

          <section>
            <h3 className="label mb-2">Status</h3>
            <ul className="text-sm space-y-0.5">
              {cell.statuses.map((s) => (
                <li key={s.name} className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="tabular text-muted">{fmt(s.records)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="label mb-2">
              Most listed places <span className="font-normal text-muted">of {fmt(cell.placeCount ?? cell.places.length)}</span>
            </h3>
            <ul className="divide-y divide-rule border-y border-rule">
              {cell.places.map((p) => (
                <li key={p.name} className="flex items-center gap-2 py-1.5 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-faint flex-shrink-0" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-faint tabular">{fmt(p.records)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </PanelShell>
  );
}
