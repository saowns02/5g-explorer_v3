"""KPI: spatial query time, measured inside PostgreSQL with EXPLAIN ANALYZE.

Run where the database is, so no network time is included:
    native:     DATABASE_URL=... python kpi/query_timing.py native
    openstack:  copy this file to the DB VM and run it there with the VM's venv:
                scp -o ProxyJump=ubuntu@<web-fip> kpi/query_timing.py ubuntu@<db-ip>:/tmp/
                ssh -J ubuntu@<web-fip> ubuntu@<db-ip>
                then on the DB VM:
                  export DATABASE_URL=postgresql://fiveg:<pass>@127.0.0.1/fiveg
                  /opt/5g-explorer/venv/bin/python /tmp/query_timing.py openstack
                then copy the CSV it prints back into results/openstack/.

Each query runs WARMUP times unrecorded, then RUNS times recorded.
"""
import csv
import datetime as dt
import os
import statistics
import sys
from pathlib import Path

import psycopg

WARMUP, RUNS = 3, 10

QUERIES = {
    # The radius search behind /nearby and the place panel: uses the GiST index.
    "nearby_25km": """
        SELECT count(*) FROM locations
        WHERE ST_DWithin(geom, ST_MakePoint(-0.1276, 51.5072)::geography, 25000)""",
    "nearby_50km_paris": """
        SELECT operator, count(*) FROM locations
        WHERE ST_DWithin(geom, ST_MakePoint(2.3522, 48.8566)::geography, 50000)
        GROUP BY operator""",
    # The heaviest globe query: every cell at resolution 2, unfiltered.
    "hexes_res2": """
        SELECT h3_r2, count(*), count(DISTINCT loc_id), count(DISTINCT operator)
        FROM locations GROUP BY h3_r2""",
    "place_search": """
        SELECT id FROM places WHERE search_key LIKE '%birm%' ORDER BY records DESC LIMIT 8""",
}


def explain(cur, sql):
    cur.execute("EXPLAIN (ANALYZE, FORMAT JSON) " + sql)
    plan = cur.fetchone()[0][0]
    return plan["Planning Time"], plan["Execution Time"], "locations_geom_gist" in str(plan)


def main():
    env = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    url = os.environ.get("DATABASE_URL", "postgresql://postgres@localhost:5432/fiveg")
    out_dir = Path(os.environ.get("OUT_DIR", Path(__file__).resolve().parents[1] / "results" / env))
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{dt.date.today()}-query-timing.csv"
    stamp = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    rows = []
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        version = conn.execute("SELECT version()").fetchone()[0].split(",")[0]
        for name, sql in QUERIES.items():
            for _ in range(WARMUP):
                explain(cur, sql)
            times = []
            for run in range(1, RUNS + 1):
                planning, execution, gist = explain(cur, sql)
                times.append(execution)
                rows.append([stamp, env, name, run, f"{planning:.3f}", f"{execution:.3f}", gist])
            print(f"{name:20s} mean {statistics.mean(times):8.2f} ms  sd {statistics.stdev(times):6.2f}  gist={gist}")

    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow([f"# {version}"])
        w.writerow(["date", "environment", "query", "run", "planning_ms", "execution_ms", "uses_gist"])
        w.writerows(rows)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
