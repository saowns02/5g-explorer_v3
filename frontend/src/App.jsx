import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, SlidersHorizontal, GitCompareArrows } from 'lucide-react';
import { api } from './api/client.js';
import GlobeView from './components/GlobeView.jsx';
import Sidebar from './components/Sidebar.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import PlacePanel from './components/PlacePanel.jsx';
import PlaceSearch from './components/PlaceSearch.jsx';
import CompareView from './components/CompareView.jsx';
import { Legend, KpiTile, DensestCells, ResetViewButton } from './components/Overlays.jsx';

// Camera altitude that keeps each H3 resolution on screen when flying to a cell.
const FLY_ALTITUDE = { 2: 2.3, 3: 1.3, 4: 0.6 };
const PLACE_ALTITUDE = 0.5;

// Loads one place's detail for the current radius.
function usePlace(id, km, onError) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!id) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api
      .place(id, { km })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && onError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, km, onError]);
  return [data, loading];
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ operators: [], statuses: [] });
  const [heightMode, setHeightMode] = useState('locations');
  const [res, setRes] = useState(2);
  const [hexData, setHexData] = useState(null);
  const [hexLoading, setHexLoading] = useState(true);
  const [topCells, setTopCells] = useState(null);
  const [selected, setSelected] = useState(null); // { h3, res }
  const [cell, setCell] = useState(null);
  const [cellLoading, setCellLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Places: A is the place in the side panel and the left side of a comparison.
  const [placeA, setPlaceA] = useState(null); // id
  const [placeB, setPlaceB] = useState(null); // id
  const [km, setKm] = useState(25);
  const [comparing, setComparing] = useState(false);
  const globe = useRef(null);

  const [a, loadingA] = usePlace(placeA, km, setError);
  const [b, loadingB] = usePlace(comparing ? placeB : null, km, setError);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(e.message));
    api.health().catch(() => {});
  }, []);

  // Hexagon aggregates for the current filters and zoom level.
  useEffect(() => {
    let cancelled = false;
    setHexLoading(true);
    const params = { res, ...filters };
    api
      .hexes(params)
      .then((d) => !cancelled && setHexData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setHexLoading(false));
    setTopCells(null);
    api
      .topCells({ ...params, limit: 5 })
      .then((d) => !cancelled && setTopCells(d))
      .catch(() => !cancelled && setTopCells([]));
    return () => {
      cancelled = true;
    };
  }, [res, filters]);

  // Detail for the selected cell; refreshes when filters change.
  useEffect(() => {
    if (!selected) {
      setCell(null);
      return undefined;
    }
    let cancelled = false;
    setCellLoading(true);
    api
      .cell(selected.h3, { res: selected.res, ...filters })
      .then((d) => !cancelled && setCell(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setCellLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, filters]);

  const selectHex = useCallback(
    (h) => {
      setSelected(h ? { h3: h.h3, res } : null);
      if (h) setPlaceA(null);
    },
    [res],
  );

  const pickTopCell = (c) => {
    setSelected({ h3: c.h3, res });
    setPlaceA(null);
    globe.current?.flyTo(c.lat, c.lng, FLY_ALTITUDE[res]);
  };

  const pickPlace = (p) => {
    setPlaceA(p.id);
    setSelected(null);
    globe.current?.flyTo(p.lat, p.lng, PLACE_ALTITUDE);
  };

  const markers = useMemo(() => {
    const out = [];
    if (a) out.push({ lat: a.lat, lng: a.lng, label: a.name });
    if (comparing && b) out.push({ lat: b.lat, lng: b.lng, label: b.name });
    return out;
  }, [a, b, comparing]);

  const hasFilters = filters.operators.length > 0 || filters.statuses.length > 0;
  const totals = hasFilters || !meta ? hexData?.totals : meta.totals;
  const showPlace = !comparing && (placeA != null);

  return (
    <div className="flex h-full overflow-hidden relative">
      <div className={`${filtersOpen ? 'flex' : 'hidden'} lg:flex absolute lg:static inset-0 z-40 lg:z-auto`}>
        <Sidebar
          meta={meta}
          totals={totals}
          loading={hexLoading}
          filters={filters}
          setFilters={setFilters}
          heightMode={heightMode}
          setHeightMode={setHeightMode}
          onClose={() => setFiltersOpen(false)}
        />
      </div>

      <main className="flex-1 relative overflow-hidden map-table">
        <GlobeView
          ref={globe}
          hexes={hexData?.hexes ?? []}
          res={hexData?.res ?? res}
          heightMode={heightMode}
          selectedH3={selected?.res === (hexData?.res ?? res) ? selected?.h3 : null}
          onSelect={selectHex}
          onResolutionChange={setRes}
          markers={markers}
        />

        {(!hexData || !meta) && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="overlay px-5 py-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Loading 5G listings</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 max-w-lg w-[92%]">
            <div className="overlay border-signal/60 p-3.5 flex gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-signal mt-0.5" />
              <div className="text-sm flex-1">
                <div className="font-semibold">The data didn&apos;t load</div>
                <div className="text-muted text-xs mt-0.5">{error}</div>
              </div>
              <button type="button" onClick={() => setError(null)} className="text-xs text-muted underline self-start">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 right-4 flex flex-wrap items-start gap-2 sm:gap-3 pointer-events-none z-20">
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="lg:hidden overlay px-3 py-2 flex items-center gap-1.5 text-sm font-medium semi"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>
            <ResetViewButton onClick={() => globe.current?.reset()} />
          </div>
          <div className="pointer-events-auto order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:max-w-md flex gap-2">
            <PlaceSearch onPick={pickPlace} className="flex-1" />
            <button
              type="button"
              onClick={() => setComparing(true)}
              className="overlay px-3 py-2 flex items-center gap-1.5 text-sm font-medium semi hover:bg-ground whitespace-nowrap"
            >
              <GitCompareArrows className="w-4 h-4" /> Compare
            </button>
          </div>
          <div className="pointer-events-auto hidden md:block ml-auto">
            <KpiTile />
          </div>
        </div>

        {hexData && hexData.hexes.length === 0 && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 overlay px-4 py-3 text-sm text-muted">
            No 5G listings match these filters.
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 pointer-events-none z-10">
          <div className="pointer-events-auto">
            <Legend heightMode={heightMode} res={hexData?.res ?? res} />
          </div>
          <div className="pointer-events-auto hidden md:block">
            <DensestCells cells={topCells} selectedH3={selected?.h3} onPick={pickTopCell} />
          </div>
        </div>

        {comparing && (
          <CompareView
            a={a}
            b={b}
            loadingA={loadingA}
            loadingB={loadingB}
            km={km}
            setKm={setKm}
            onPickA={(p) => setPlaceA(p.id)}
            onPickB={(p) => setPlaceB(p.id)}
            onSwap={() => {
              setPlaceA(placeB);
              setPlaceB(placeA);
            }}
            onClose={() => setComparing(false)}
          />
        )}
      </main>

      {showPlace ? (
        <PlacePanel
          place={a}
          loading={loadingA}
          km={km}
          setKm={setKm}
          onClose={() => setPlaceA(null)}
          onCompare={() => setComparing(true)}
        />
      ) : (
        !comparing && <DetailPanel cell={cell} loading={cellLoading} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
