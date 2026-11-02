# 5G Globe Explorer

Three-tier web app mapping reported 5G availability on a 3D globe, deployed natively and on OpenStack for comparison.

| Folder | Contents |
|--------|----------|
| `frontend/` | React (Vite) + react-globe.gl. Runs on a built-in mock or on the live API |
| `api/` | FastAPI service: globe endpoints, place search and place detail, plus `/nearby` for the spatial KPI |
| `db/` | `schema.sql` (PostGIS, GiST index), `load.py` loader, `etl/` cleaning, `tests/` data validation |
| `deploy/native/` | `setup.sh` for the native baseline, Nginx and systemd templates |
| `deploy/openstack/` | Provisioning script or Heat template (Phase 3) |
| `data/` | Raw and cleaned CSV. Every environment loads the cleaned file |
| `docs/troubleshooting.md` | Problem log, from day one |
| `results/` | KPI result CSVs |

Versions: Ubuntu 24.04, PostgreSQL 16, PostGIS 3.4, Python 3.12, Node 18 or newer.

## Run it on a laptop

You need Docker (for the dev database only), Python 3.12 and Node.

```bash
# 1. Database with PostGIS (also creates fiveg_test for pytest)
docker compose -f docker-compose.dev.yml up -d

# 2. Python environment
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r api/requirements-dev.txt

# 3. Load the data (about 5 seconds)
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fiveg
python db/load.py data/5g_coverage_clean.csv

# 4. API on port 8000 (docs at http://localhost:8000/docs)
cd api && uvicorn app.main:app --reload --port 8000

# 5. Frontend against the live API, in a second terminal
cd frontend && npm install
VITE_API_URL=/api npm run dev                            # http://localhost:5173
```

On Windows PowerShell, set variables with `$env:DATABASE_URL="..."` and `$env:VITE_API_URL="/api"`.

The KPI tile in the top right should say **Live API**. Without `VITE_API_URL` the frontend uses its mock.

## Tests

```bash
pytest db/tests                                           # data validation (CI "validate data" stage)
cd api && TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fiveg_test pytest
cd frontend && npm test
```

## Update the dataset

```bash
python db/etl/clean.py data/5g_coverage.csv data/5g_coverage_clean.csv
python db/etl/export_frontend.py data/5g_coverage_clean.csv frontend/public/data/points.json
EXPECTED_ROWS=<new count> pytest db/tests
```

If an operator name changes, update `db/operators.txt` (the agreed list) in the same pull request.

## Native baseline

On the host, from a clone at the release tag:

```bash
sudo ./deploy/native/setup.sh            # Nginx on :8080, API on :8000, PostgreSQL on :5432 (local only)
sudo CAP=1 ./deploy/native/setup.sh      # same, with CPU and memory caps matching the VM flavours
```

It prints the provisioning time at the end. Re-run it after every `git pull`.
