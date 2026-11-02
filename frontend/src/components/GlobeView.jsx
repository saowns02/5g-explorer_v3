import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import Globe from 'react-globe.gl';
import { MeshPhongMaterial, Color } from 'three';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import {
  altitudeScale,
  operatorColor,
  resolutionForAltitude,
  SELECTED_COLOR,
  MAX_ALTITUDE_BY_RES,
  fmt,
} from '../lib/scales.js';

// Country outlines are bundled with the app (no texture download), so the
// globe renders on VMs without internet access.
const COUNTRIES = feature(countriesTopo, countriesTopo.objects.countries).features.filter(
  (f) => f.properties.name !== 'Antarctica',
);

const globeMaterial = new MeshPhongMaterial({
  color: new Color('#132636'),
  emissive: new Color('#0b1823'),
  shininess: 4,
});

function useSize(ref) {
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function tooltip(cell) {
  return `
    <div style="background:#fafbfa;color:#17212b;border:1px solid #d3dad8;border-radius:6px;padding:8px 10px;box-shadow:0 6px 20px rgba(15,27,38,.25);min-width:150px;font-size:12px;line-height:1.5">
      <div style="display:grid;grid-template-columns:auto auto;gap:0 14px">
        <span style="color:#5d6b77">Records</span><b style="text-align:right;font-variant-numeric:tabular-nums">${fmt(cell.records)}</b>
        <span style="color:#5d6b77">Locations</span><b style="text-align:right;font-variant-numeric:tabular-nums">${fmt(cell.locations)}</b>
        <span style="color:#5d6b77">Operators</span><b style="text-align:right;font-variant-numeric:tabular-nums">${cell.operators}</b>
      </div>
      <div style="color:#8a96a0;margin-top:4px">Click for detail</div>
    </div>`;
}

// Great-circle distance in degrees between two lat/lng points.
function angularDistance(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / r;
}

// At fine resolutions only cells near the camera are drawn, which keeps the
// number of meshes in the low thousands on modest GPUs.
const CULL_FROM_RES = 4;
const CULL_RADIUS_DEG = 40;

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const GlobeView = forwardRef(function GlobeView(
  { hexes, res, heightMode, selectedH3, onSelect, onResolutionChange, markers = [] },
  ref,
) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const { width, height } = useSize(wrapRef);
  const zoomTimer = useRef(null);
  const [view, setView] = useState({ lat: 30, lng: 5 });

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, altitude = 0.8) {
      globeRef.current?.pointOfView({ lat, lng, altitude }, 1200);
    },
    reset() {
      globeRef.current?.pointOfView({ lat: 30, lng: 5, altitude: 2.3 }, 1200);
    },
  }));

  // Initial camera over Europe / North Atlantic, where most records sit.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 30, lng: 5, altitude: 2.3 }, 0);
    const controls = g.controls();
    controls.autoRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 120;
    controls.maxDistance = 700;
  }, []);

  const drawn = useMemo(() => {
    if (res < CULL_FROM_RES) return hexes;
    return hexes.filter((h) => angularDistance(view.lat, view.lng, h.lat, h.lng) < CULL_RADIUS_DEG);
  }, [hexes, res, view]);

  const metric = heightMode === 'operators' ? 'operators' : 'locations';
  const maxValue = useMemo(
    () => hexes.reduce((m, h) => Math.max(m, h[metric]), 0),
    [hexes, metric],
  );

  const handleZoom = ({ lat, lng, altitude }) => {
    clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => {
      setView((v) => (angularDistance(v.lat, v.lng, lat, lng) > 8 ? { lat, lng } : v));
      const next = resolutionForAltitude(altitude);
      if (next !== res) onResolutionChange(next);
    }, 250);
  };

  const cellOf = (d) => d.points[0];

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#9fb7c9"
        atmosphereAltitude={0.12}
        polygonsData={COUNTRIES}
        polygonAltitude={0.0025}
        polygonCapColor={() => '#25394b'}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={() => '#47607a'}
        polygonsTransitionDuration={0}
        hexBinPointsData={drawn}
        hexBinPointLat="lat"
        hexBinPointLng="lng"
        hexBinPointWeight="records"
        hexBinResolution={res}
        hexBinMerge={false}
        hexMargin={0.12}
        hexAltitude={(d) => altitudeScale(cellOf(d)[metric], maxValue, res)}
        hexTopColor={(d) =>
          cellOf(d).h3 === selectedH3 ? SELECTED_COLOR : operatorColor(cellOf(d).operators)
        }
        hexSideColor={(d) =>
          cellOf(d).h3 === selectedH3
            ? 'rgba(56,189,248,0.85)'
            : `${operatorColor(cellOf(d).operators)}cc`
        }
        hexTransitionDuration={600}
        hexLabel={(d) => tooltip(cellOf(d))}
        onHexClick={(d) => onSelect(cellOf(d))}
        onGlobeClick={() => onSelect(null)}
        onZoom={handleZoom}
        labelsData={markers}
        labelLat="lat"
        labelLng="lng"
        labelText="label"
        labelSize={0.9}
        labelDotRadius={0.45}
        labelColor={() => '#f3f6f8'}
        labelAltitude={(MAX_ALTITUDE_BY_RES[res] ?? 0.3) + 0.012}
        labelResolution={3}
        labelsTransitionDuration={300}
        ringsData={REDUCED_MOTION ? [] : markers}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => (t) => `rgba(56,189,248,${1 - t})`}
        ringMaxRadius={2.2}
        ringPropagationSpeed={1.6}
        ringRepeatPeriod={1400}
        ringAltitude={0.004}
      />
    </div>
  );
});

export default GlobeView;
