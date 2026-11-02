import { useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { fmt, fmtCompact } from '../lib/scales.js';

function Readouts({ totals, loading }) {
  const items = [
    { label: 'records', value: totals?.records },
    { label: 'operators', value: totals?.operators },
    { label: 'locations', value: totals?.locations },
  ];
  return (
    <dl className="grid grid-cols-3 border-y border-rule divide-x divide-rule">
      {items.map((it) => (
        <div key={it.label} className={`py-3 px-3 first:pl-0 ${loading ? 'opacity-40' : ''}`}>
          <dt className="sr-only">{it.label}</dt>
          <dd className="readout text-[26px]" title={it.value != null ? fmt(it.value) : ''}>
            {it.value == null ? '–' : fmtCompact(it.value)}
          </dd>
          <dd className="text-xs text-muted mt-1.5 semi">{it.label}</dd>
        </div>
      ))}
    </dl>
  );
}

function HeightToggle({ value, onChange }) {
  return (
    <section>
      <h2 className="label mb-2">Column height</h2>
      <div className="seg" role="group" aria-label="Column height">
        <button type="button" aria-pressed={value === 'locations'} onClick={() => onChange('locations')}>
          Locations
        </button>
        <button type="button" aria-pressed={value === 'operators'} onClick={() => onChange('operators')}>
          Operators
        </button>
      </div>
      <p className="hint mt-2">
        {value === 'operators'
          ? 'Taller columns have more operators competing in the cell.'
          : 'Taller columns have more distinct places reported as 5G.'}{' '}
        Colour always shows competing operators.
      </p>
    </section>
  );
}

function StatusFilter({ statuses, selected, onChange }) {
  const toggle = (name) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);
  return (
    <section>
      <h2 className="label mb-2">Status</h2>
      <ul className="space-y-1">
        {statuses.map((s) => {
          const on = selected.length === 0 || selected.includes(s.name);
          return (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => toggle(s.name)}
                aria-pressed={selected.includes(s.name)}
                className="w-full flex items-center gap-2.5 text-sm py-0.5 text-left group"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${
                    selected.includes(s.name) ? 'bg-ink border-ink' : 'border-muted bg-panel group-hover:border-ink'
                  }`}
                >
                  {selected.includes(s.name) && <Check className="w-2.5 h-2.5 text-panel" strokeWidth={3.5} />}
                </span>
                <span className={`flex-1 ${on ? 'text-ink' : 'text-faint'}`}>{s.name}</span>
                <span className="text-xs text-faint tabular">{fmt(s.records)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hint mt-1.5">{selected.length ? 'Showing ticked statuses only.' : 'Showing every status. Tick to narrow.'}</p>
    </section>
  );
}

function OperatorFilter({ operators, selected, onChange }) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...operators].sort((a, b) => b.records - a.records), [operators]);
  const q = query.trim().toLowerCase();
  const visible = q ? sorted.filter((o) => o.name.toLowerCase().includes(q)) : sorted;
  const toggle = (name) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);

  return (
    <section className="flex flex-col min-h-[14rem] flex-1">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="label">
          <label htmlFor="op-search">Operators</label>
        </h2>
        {selected.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
            Clear {selected.length}
          </button>
        ) : (
          <span className="text-xs text-faint">all {operators.length}</span>
        )}
      </div>
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          id="op-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by operator name"
          className="w-full pl-8 pr-7 py-1.5 bg-panel border border-rule rounded text-sm outline-none focus:border-ink"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink"
            aria-label="Clear operator filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selected.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className="text-xs pl-2 pr-1 py-0.5 rounded-sm bg-ink text-panel flex items-center gap-1 hover:bg-muted"
              aria-label={`Remove ${name}`}
            >
              {name} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
      <ul className="overflow-y-auto scroll-thin border-t border-rule min-h-[9rem] flex-1 -mx-1 px-1">
        {visible.length === 0 && <li className="py-4 text-xs text-muted">No operator name contains “{query}”.</li>}
        {visible.map((o) => {
          const active = selected.includes(o.name);
          return (
            <li key={o.name} className="border-b border-rule/60">
              <button
                type="button"
                onClick={() => toggle(o.name)}
                aria-pressed={active}
                className="w-full flex items-center gap-2.5 py-1.5 text-left text-sm group"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${
                    active ? 'bg-ink border-ink' : 'border-muted bg-panel group-hover:border-ink'
                  }`}
                >
                  {active && <Check className="w-2.5 h-2.5 text-panel" strokeWidth={3.5} />}
                </span>
                <span className={`flex-1 truncate ${active ? 'font-semibold' : ''}`}>{o.name}</span>
                <span className="text-xs text-faint tabular">{fmt(o.records)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Sidebar({ meta, totals, loading, filters, setFilters, heightMode, setHeightMode, onClose }) {
  return (
    <aside className="w-full lg:w-[22rem] bg-ground border-r border-rule px-6 pt-6 pb-5 flex flex-col h-full z-20 overflow-y-auto scroll-thin">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="wide font-extrabold text-[22px] leading-[1.05] tracking-[-0.01em]">
            5G Globe
            <br />
            Explorer
          </h1>
          <p className="text-sm text-muted mt-2 leading-snug">
            Where mobile operators say they offer 5G{meta ? `, from ${fmt(meta.totals.records)} listings` : ''}.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="lg:hidden p-1.5 -mr-1.5 text-muted hover:text-ink" aria-label="Close filters">
            <X className="w-5 h-5" />
          </button>
        )}
      </header>

      <div className="space-y-5 flex-1 flex flex-col">
        <Readouts totals={totals} loading={loading} />
        <HeightToggle value={heightMode} onChange={setHeightMode} />
        <StatusFilter
          statuses={meta?.statuses ?? []}
          selected={filters.statuses}
          onChange={(statuses) => setFilters((f) => ({ ...f, statuses }))}
        />
        <OperatorFilter
          operators={meta?.operators ?? []}
          selected={filters.operators}
          onChange={(operators) => setFilters((f) => ({ ...f, operators }))}
        />
      </div>

      <p className="mt-4 pt-3 border-t border-rule text-xs text-muted leading-relaxed">
        <strong className="text-ink font-semibold">Reported availability, not coverage.</strong> Operators list places
        where they offer 5G, and they list very unevenly: Europe holds about 58% of records and France lists every
        commune, while China has 114.
      </p>
    </aside>
  );
}
