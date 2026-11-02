"""Load the cleaned CSV into PostgreSQL + PostGIS.

Usage:
    DATABASE_URL=postgresql://fiveg:secret@localhost:5432/fiveg \
        python db/load.py data/5g_coverage_clean.csv

Applies db/schema.sql (drops and recreates the table), computes H3 cells and
location ids in Python, then bulk-loads with COPY. Every environment builds
its database this way from the same CSV, so no database is ever copied.
"""
import csv
import functools
import io
import os
import sys
import time
import unicodedata
from pathlib import Path

import h3
import psycopg

SCHEMA = Path(__file__).with_name("schema.sql")
RESOLUTIONS = (2, 3, 4)
COLUMNS = (
    "id", "operator", "city_name", "status", "latitude", "longitude",
    "zero_coord", "loc_id", "geom", "h3_r2", "h3_r3", "h3_r4", "place_id",
)
PLACE_COLUMNS = ("id", "name", "search_key", "lat", "lng", "records", "operators")

@functools.cache
def search_key(name: str) -> str:
    """Lower case without accents. Must match searchKey() in frontend/src/api/mock.js."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower().strip()


def pg_quote(text: str) -> str:
    """One element of a PostgreSQL array literal, quoted and escaped."""
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


class Places:
    """Accumulates one row per place while the locations stream past."""

    def __init__(self):
        self.ids = {}
        self.rows = {}

    def add(self, row_id, name, cell_r3, lat, lng, operator):
        # Grouped by the accent-free key, so "Zurich" and "Zürich" in the
        # same area are one place; it keeps the first spelling seen.
        pid = self.ids.setdefault((search_key(name), cell_r3), row_id)
        p = self.rows.get(pid)
        if p is None:
            p = self.rows[pid] = {"name": name, "lat": 0.0, "lng": 0.0, "n": 0, "ops": set()}
        p["lat"] += lat
        p["lng"] += lng
        p["n"] += 1
        p["ops"].add(operator)
        return pid

    def copy_rows(self):
        for pid, p in self.rows.items():
            ops = "{" + ",".join(pg_quote(o) for o in sorted(p["ops"])) + "}"
            yield (pid, p["name"], search_key(p["name"]), p["lat"] / p["n"], p["lng"] / p["n"], p["n"], ops)


def read_rows(csv_path, places):
    """Yield one tuple per record in COPY column order."""
    loc_ids = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f), start=1):
            lat, lng = float(row["latitude"]), float(row["longitude"])
            loc_id = loc_ids.setdefault((lat, lng), len(loc_ids) + 1)
            cells = [h3.latlng_to_cell(lat, lng, r) for r in RESOLUTIONS]
            place_id = places.add(i, row["city_name"], cells[1], lat, lng, row["operator"])
            yield (
                i,
                row["operator"],
                row["city_name"],
                row["status"],
                lat,
                lng,
                row.get("zero_coord_flag", "False") == "True",
                loc_id,
                f"SRID=4326;POINT({lng} {lat})",
                *cells,
                place_id,
            )


def copy_csv(cur, table, columns, rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    n = 0
    for row in rows:
        writer.writerow(row)
        n += 1
    buf.seek(0)
    with cur.copy(f"COPY {table} ({', '.join(columns)}) FROM STDIN WITH (FORMAT csv)") as copy:
        copy.write(buf.read())
    return n


def load(conn, csv_path):
    places = Places()
    with conn.cursor() as cur:
        cur.execute(SCHEMA.read_text())
        n = copy_csv(cur, "locations", COLUMNS, read_rows(csv_path, places))
        copy_csv(cur, "places", PLACE_COLUMNS, places.copy_rows())
        cur.execute("ANALYZE locations")
        cur.execute("ANALYZE places")
    conn.commit()
    return n


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "data/5g_coverage_clean.csv"
    url = os.environ.get("DATABASE_URL", "postgresql://postgres@localhost:5432/fiveg")
    t0 = time.perf_counter()
    with psycopg.connect(url) as conn:
        n = load(conn, csv_path)
    print(f"loaded {n} rows in {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
