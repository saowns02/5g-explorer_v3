# 5G Globe Explorer frontend

React (Vite) + react-globe.gl single page app. Hexagon columns on a 3D globe: height = distinct 5G locations (or competing operators, via the toggle), colour = number of competing operators in the cell.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # vitest unit tests (mock API, scales, p95)
npm run build      # production bundle in dist/, served by Nginx
```

## Data and API modes

The app talks to data only through `src/api/client.js`.

| Mode | How | Source |
|------|-----|--------|
| Mock (default) | `VITE_API_URL` unset | `public/data/points.json`, aggregated in the browser with h3-js |
| Live | `VITE_API_URL=/api` (see `.env.example`) | FastAPI service |

The mock and the FastAPI service (`api/`) return the same JSON shapes. To run against the live API in dev, start the API on port 8000 and run `VITE_API_URL=/api npm run dev`; Vite proxies `/api` to it. Ties between places in a cell go to the earliest row of the CSV in both. Endpoints:

| Endpoint | Returns |
|----------|---------|
| `GET /health` | `{ status }` |
| `GET /meta` | `{ totals: {records, operators, locations}, operators: [{name, records}], statuses: [{name, records}] }` |
| `GET /hexes?res=&operators=&statuses=` | `{ res, totals, hexes: [{h3, lat, lng, records, locations, operators}] }` |
| `GET /cells/{h3}?res=&operators=&statuses=` | `{ h3, res, lat, lng, records, locations, operators: [{name, records, share}], statuses, places, placeCount }` |
| `GET /top-cells?res=&operators=&statuses=&limit=5` | top cells by records, each with `place` and `topOperator` |
| `GET /places?q=&limit=8` | places whose name contains `q` (any case or accents): `[{id, name, lat, lng, records, operators, topOperators}]` |
| `GET /places/{id}?km=25` | one place: `atPlace {records, operators[], statuses}` and `nearby {km, records, locations, places, operators[{name, records, share}], statuses}` |
| `GET /nearby?lat=&lng=&km=&limit=` | records within `km` of a point (not used by the UI; the spatial query for the KPI tests) |

List parameters are comma separated. H3 resolution follows camera altitude: 2 when zoomed out, 3 mid, 4 close in (cells farther than 40 degrees from the camera centre are not drawn at res 4).

Regenerate the mock data after re-running the ETL:

```bash
python db/etl/clean.py data/5g_coverage.csv data/5g_coverage_clean.csv
python db/etl/export_frontend.py data/5g_coverage_clean.csv frontend/public/data/points.json
```

## Layout

| Area | Contents |
|------|----------|
| Left sidebar | Header stats, column height toggle, status filter, operator search, data caveat |
| Globe | Hex columns, hover tooltip, click for detail, reset view |
| Overlays | Legend, live API p95 KPI tile, densest cells (top 5) |
| Right panel | Selected cell, or selected place (operators at the place, radius figures, operator share donut) |
| Compare view | Two places side by side: operators at both or one, radius figures, donuts, back-to-back operator bars, status mix |
| Place search | Top of the globe. A place is one name (ignoring accents) inside one H3 resolution-3 cell, so same-named towns in different regions stay separate |

## Offline VMs

Country outlines (world-atlas) and the Archivo font (@fontsource-variable) are bundled, and there is no globe texture, so nothing is fetched from the internet at runtime.
