// Small hand-built SVG/HTML charts for the place and compare views.
import { useState } from 'react';
import { fmt, fmtPct } from '../lib/scales.js';

// ---------- hover tooltip ----------

export function useHover() {
  const [tip, setTip] = useState(null);
  const bind = (content) => ({
    onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div
      role="tooltip"
      className="fixed z-[100] pointer-events-none overlay px-2.5 py-1.5 text-xs text-ink"
      style={{ left: tip.x + 12, top: tip.y + 12 }}
    >
      {tip.content}
    </div>
  ) : null;
  return { bind, node };
}

// ---------- donut ----------

function arcPath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(r1, a0);
  const [x1, y1] = p(r1, a1);
  const [x2, y2] = p(r0, a1);
  const [x3, y3] = p(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

export function Donut({ slices, total, size = 168, label = 'records', hover }) {
  const r1 = size / 2 - 2;
  const r0 = r1 * 0.62;
  const c = size / 2;
  let a = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Operator share of ${fmt(total)} ${label}`}>
      {slices.length === 1 ? (
        <g {...hover?.bind(<SliceTip s={slices[0]} />)}>
          <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" stroke={slices[0].color} strokeWidth={r1 - r0} />
        </g>
      ) : (
        slices.map((s) => {
          const a0 = a;
          a += s.share * Math.PI * 2;
          return (
            <path
              key={s.name}
              d={arcPath(c, c, r0, r1, a0, a)}
              fill={s.color}
              stroke="#fafbfa"
              strokeWidth="2"
              className="hover:opacity-80 transition-opacity"
              {...hover?.bind(<SliceTip s={s} />)}
            />
          );
        })
      )}
      <text x={c} y={c - 1} textAnchor="middle" fontSize="20" fontWeight="700" fill="#17212b" style={{ fontStretch: '125%', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(total)}
      </text>
      <text x={c} y={c + 16} textAnchor="middle" fontSize="11" fill="#5d6b77">
        {label}
      </text>
    </svg>
  );
}

function SliceTip({ s }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
      <b>{s.name}</b> {fmt(s.records)} · {fmtPct(s.share)}
    </span>
  );
}

// ---------- butterfly (back-to-back) bars: A grows left, B grows right ----------

export function Butterfly({ rows, colorOf = () => '#64748b', hover, nameA, nameB, format = fmt }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-end gap-1.5 min-w-0">
            <span className="text-xs text-muted tabular">{format(r.a)}</span>
            <div className="flex-1 flex justify-end h-3.5">
              <div
                className="h-full rounded-l-[4px]"
                style={{ width: `${(r.a / max) * 100}%`, minWidth: r.a ? 2 : 0, background: colorOf(r.label) }}
                {...hover?.bind(<span><b>{r.label}</b> in {nameA}: {format(r.a)}</span>)}
              />
            </div>
          </div>
          <div className="text-xs font-semibold text-ink text-center w-28 sm:w-32 truncate" title={r.label}>
            {r.label}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex-1 h-3.5">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${(r.b / max) * 100}%`, minWidth: r.b ? 2 : 0, background: colorOf(r.label) }}
                {...hover?.bind(<span><b>{r.label}</b> in {nameB}: {format(r.b)}</span>)}
              />
            </div>
            <span className="text-xs text-muted tabular">{format(r.b)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- 100% stacked bar ----------

const STATUS_SHADES = { Commercial: '#256abf', 'Pre-release': '#6da7ec', Limited: '#b7d3f6' };

export function StatusBar({ statuses, hover }) {
  const total = statuses.reduce((s, x) => s + x.records, 0) || 1;
  return (
    <div>
      <div className="flex h-3.5 rounded-sm overflow-hidden gap-[2px] bg-panel">
        {statuses.map((s) => (
          <div
            key={s.name}
            style={{ width: `${(s.records / total) * 100}%`, background: STATUS_SHADES[s.name] ?? '#94a3b8' }}
            {...hover?.bind(<span><b>{s.name}</b> {fmt(s.records)} · {fmtPct(s.records / total)}</span>)}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {statuses.map((s) => (
          <span key={s.name} className="flex items-center gap-1 text-xs text-muted">
            <span className="w-2 h-2 rounded-sm" style={{ background: STATUS_SHADES[s.name] ?? '#94a3b8' }} />
            {s.name} <b className="text-ink tabular">{fmtPct(s.records / total)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- legend ----------

export function OperatorLegend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-1.5 text-xs text-ink">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: it.color }} />
          {it.name}
        </li>
      ))}
    </ul>
  );
}
