import { useMemo } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { PanelShell, ReadoutRow } from './DetailPanel.jsx';
import { Donut, useHover } from './charts.jsx';
import { fmt, fmtPct } from '../lib/scales.js';
import { RADII, fmtCoord, operatorColours, shareSlices } from '../lib/places.js';

export function RadiusSwitch({ km, setKm, id }) {
  return (
    <div className="seg w-max" role="group" aria-label="Radius" id={id}>
      {RADII.map((r) => (
        <button key={r} type="button" aria-pressed={km === r} onClick={() => setKm(r)} className="!flex-none px-3">
          {r} km
        </button>
      ))}
    </div>
  );
}

export default function PlacePanel({ place, loading, km, setKm, onClose, onCompare }) {
  const hover = useHover();
  const chart = useMemo(() => {
    if (!place) return null;
    const { colours, named } = operatorColours(place.nearby.operators);
    return shareSlices(place.nearby.operators, named, colours);
  }, [place]);

  if (!place && !loading) return null;
  const at = place?.atPlace;
  const near = place?.nearby;

  return (
    <PanelShell
      label="Place detail"
      kicker="Place"
      title={place?.name ?? 'Loading…'}
      sub={place ? fmtCoord(place.lat, place.lng) : null}
      onClose={onClose}
      loading={loading}
    >
      {place && (
        <>
          <section>
            <h3 className="label mb-1">At {place.name}</h3>
            <p className="text-sm text-muted mb-2.5">
              {at.operators.length} operator{at.operators.length === 1 ? ' lists' : 's list'} 5G here.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {at.operators.map((o) => (
                <li key={o} className="text-sm px-2 py-0.5 border border-ink/70 rounded-sm">
                  {o}
                </li>
              ))}
            </ul>
            {at.statuses.some((s) => s.name !== 'Commercial') && (
              <p className="text-xs text-muted mt-2">
                {at.statuses.map((s) => `${s.records} ${s.name.toLowerCase()}`).join(', ')}
              </p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="label">Surrounding area</h3>
              <RadiusSwitch km={km} setKm={setKm} />
            </div>
            <ReadoutRow items={[['records', near.records], ['locations', near.locations], ['places', near.places]]} />
            <p className="hint mt-2">Everything listed within {near.km} km of the centre of {place.name}.</p>
          </section>

          {chart && chart.total > 0 && (
            <section>
              <h3 className="label mb-3">Share of records by operator</h3>
              <div className="flex items-center gap-5">
                <Donut slices={chart.slices} total={chart.total} size={136} hover={hover} />
                <ul className="flex-1 min-w-0 space-y-1">
                  {chart.slices.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="tabular text-muted text-xs">{fmt(s.records)}</span>
                      <span className="tabular font-semibold w-9 text-right">{fmtPct(s.share)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={onCompare}
            className="w-full flex items-center justify-center gap-2 bg-ink text-panel rounded py-2.5 text-sm font-semibold semi hover:bg-ink/90"
          >
            <GitCompareArrows className="w-4 h-4" /> Compare with another place
          </button>
          {hover.node}
        </>
      )}
    </PanelShell>
  );
}
