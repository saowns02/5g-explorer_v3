import { useMemo, useState } from 'react';
import { X, ArrowLeftRight } from 'lucide-react';
import PlaceSearch from './PlaceSearch.jsx';
import { RadiusSwitch } from './PlacePanel.jsx';
import { Butterfly, Donut, OperatorLegend, StatusBar, useHover } from './charts.jsx';
import { OTHER_COLOR, fmtCoord, operatorColours, overlap, shareSlices } from '../lib/places.js';

const TOP_OPERATORS = 8;

function Slot({ side, place, loading, onPick, onSwap }) {
  const [changing, setChanging] = useState(false);
  const align = side === 'A' ? 'text-right items-end' : 'text-left items-start';
  if (!place || changing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted semi">{side === 'A' ? 'First place' : 'Second place'}</span>
        <PlaceSearch
          autoFocus={!place || changing}
          placeholder={side === 'A' ? 'Choose the first place' : 'Choose a place to compare'}
          onPick={(p) => {
            setChanging(false);
            onPick(p);
          }}
        />
        {changing && (
          <button type="button" onClick={() => setChanging(false)} className="text-xs text-muted underline self-start">
            Keep {place.name}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={`flex flex-col ${align} ${loading ? 'opacity-50' : ''}`}>
      <h3 className="wide font-extrabold text-[20px] sm:text-[26px] leading-tight break-words">{place.name}</h3>
      <p className="text-xs text-muted tabular mt-1">{fmtCoord(place.lat, place.lng)}</p>
      <div className="flex gap-3 mt-1.5">
        <button type="button" onClick={() => setChanging(true)} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
          Change place
        </button>
        {onSwap && (
          <button type="button" onClick={onSwap} className="text-xs text-muted underline underline-offset-2 hover:text-ink flex items-center gap-1">
            <ArrowLeftRight className="w-3 h-3" /> Swap sides
          </button>
        )}
      </div>
    </div>
  );
}

function ChipList({ items, emptyText }) {
  if (!items.length) return <p className="text-xs text-faint">{emptyText}</p>;
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((o) => (
        <li key={o} className="text-sm px-2 py-0.5 border border-ink/70 rounded-sm bg-panel">
          {o}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="py-5 border-t border-rule">
      <div className="mb-3">
        <h3 className="label text-[14px]">{title}</h3>
        {note && <p className="hint mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function CompareView({ a, b, loadingA, loadingB, km, setKm, onPickA, onPickB, onSwap, onClose }) {
  const hover = useHover();

  const data = useMemo(() => {
    if (!a || !b) return null;
    const { colours, named, ranked } = operatorColours(a.nearby.operators, b.nearby.operators);
    const colourOf = (n) => colours.get(n) ?? OTHER_COLOR;
    const recA = new Map(a.nearby.operators.map((o) => [o.name, o.records]));
    const recB = new Map(b.nearby.operators.map((o) => [o.name, o.records]));
    return {
      named,
      colourOf,
      donutA: shareSlices(a.nearby.operators, named, colours),
      donutB: shareSlices(b.nearby.operators, named, colours),
      opRows: ranked.slice(0, TOP_OPERATORS).map((n) => ({ label: n, a: recA.get(n) ?? 0, b: recB.get(n) ?? 0 })),
      moreOps: Math.max(0, ranked.length - TOP_OPERATORS),
      sets: overlap(a.atPlace.operators, b.atPlace.operators),
    };
  }, [a, b]);

  const legendItems = data
    ? [
        ...data.named.map((n) => ({ name: n, color: data.colourOf(n) })),
        ...(data.donutA.slices.concat(data.donutB.slices).some((s) => s.name === 'Other')
          ? [{ name: 'Other operators', color: OTHER_COLOR }]
          : []),
      ]
    : [];

  return (
    <div className="absolute inset-0 z-30 bg-ground overflow-y-auto scroll-thin" role="dialog" aria-label="Compare places">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="wide font-extrabold text-[22px]">Compare two places</h2>
          <div className="flex items-center gap-3">
            <RadiusSwitch km={km} setKm={setKm} />
            <button type="button" onClick={onClose} className="overlay px-3 py-1.5 flex items-center gap-1.5 text-sm font-medium semi hover:bg-ground">
              <X className="w-4 h-4" /> Back to globe
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-start pb-5">
          <Slot side="A" place={a} loading={loadingA} onPick={onPickA} />
          <span className="text-sm text-faint pt-2 semi">and</span>
          <Slot side="B" place={b} loading={loadingB} onPick={onPickB} onSwap={a && b ? onSwap : null} />
        </div>

        {!data && (
          <p className="border-t border-rule pt-6 text-sm text-muted">
            {a || b ? 'Choose a second place to see the comparison.' : 'Choose two places to compare.'} Both are measured
            over the same radius.
          </p>
        )}

        {data && (
          <>
            <Section
              title="Operators listing 5G at the place itself"
              note={`${a.name} has ${a.atPlace.operators.length}, ${b.name} has ${b.atPlace.operators.length}.`}
            >
              <div className="grid grid-cols-3 gap-3 sm:gap-6">
                <div>
                  <p className="text-xs text-muted mb-1.5">Only {a.name}</p>
                  <ChipList items={data.sets.onlyA} emptyText="None" />
                </div>
                <div className="border-x border-rule px-3 sm:px-6">
                  <p className="text-xs text-muted mb-1.5">Both places</p>
                  <ChipList items={data.sets.both} emptyText="No operator in common" />
                </div>
                <div>
                  <p className="text-xs text-muted mb-1.5">Only {b.name}</p>
                  <ChipList items={data.sets.onlyB} emptyText="None" />
                </div>
              </div>
            </Section>

            <Section title={`Within ${km} km`} note="Listings, distinct coordinates and named places inside the radius.">
              <Butterfly
                nameA={a.name}
                nameB={b.name}
                hover={hover}
                colorOf={() => '#5d6b77'}
                rows={[
                  { label: 'Records', a: a.nearby.records, b: b.nearby.records },
                  { label: 'Locations', a: a.nearby.locations, b: b.nearby.locations },
                  { label: 'Places', a: a.nearby.places, b: b.nearby.places },
                  { label: 'Operators', a: a.nearby.operators.length, b: b.nearby.operators.length },
                ]}
              />
            </Section>

            <Section title={`Share of records by operator, within ${km} km`}>
              <div className="grid grid-cols-2 gap-6 justify-items-center">
                {[
                  [a, data.donutA],
                  [b, data.donutB],
                ].map(([p, d]) => (
                  <figure key={p.id} className="flex flex-col items-center">
                    {d.total > 0 ? (
                      <Donut slices={d.slices} total={d.total} size={168} hover={hover} />
                    ) : (
                      <div className="w-[168px] h-[168px] rounded-full border border-dashed border-rule flex items-center justify-center text-xs text-muted text-center px-6">
                        Nothing listed within {km} km
                      </div>
                    )}
                    <figcaption className="text-sm font-semibold mt-2">{p.name}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="mt-4 flex justify-center">
                <OperatorLegend items={legendItems} />
              </div>
            </Section>

            <Section
              title={`Records by operator, within ${km} km`}
              note={
                data.moreOps
                  ? `The ${TOP_OPERATORS} largest operators across both places. ${data.moreOps} smaller ones are left out.`
                  : 'Every operator listed in either area.'
              }
            >
              <div className="grid grid-cols-[1fr_auto_1fr] text-xs text-muted mb-1.5">
                <span className="text-right pr-2">{a.name}</span>
                <span className="w-28 sm:w-32" />
                <span className="pl-2">{b.name}</span>
              </div>
              <Butterfly rows={data.opRows} colorOf={data.colourOf} hover={hover} nameA={a.name} nameB={b.name} />
            </Section>

            <Section title={`Status of listings, within ${km} km`}>
              <div className="grid grid-cols-2 gap-6">
                {[a, b].map((p) => (
                  <div key={p.id}>
                    <p className="text-sm font-semibold mb-1.5">{p.name}</p>
                    {p.nearby.records ? <StatusBar statuses={p.nearby.statuses} hover={hover} /> : <p className="text-xs text-muted">No listings</p>}
                  </div>
                ))}
              </div>
            </Section>

            <p className="border-t border-rule pt-4 text-xs text-muted leading-relaxed">
              These are operator listings of 5G availability, not signal measurements. Countries list at very different
              levels of detail, so compare places in the same country with the most confidence. Each radius is measured
              from the centre of its place.
            </p>
          </>
        )}
      </div>
      {hover.node}
    </div>
  );
}
