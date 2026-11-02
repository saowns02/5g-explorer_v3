"""Export the cleaned CSV as a compact JSON file for the frontend's mock API.

Usage:
    python db/etl/export_frontend.py data/5g_coverage_clean.csv frontend/public/data/points.json

Layout (columnar, so 144k rows stay small):
    operators: [name, ...]          index = operator id
    statuses:  [name, ...]          index = status id
    places:    [city_name, ...]     index = place id
    lat, lng:  [float, ...]         rounded to 5 dp
    op, st, pl: [int, ...]          ids into the lookup lists
"""
import json
import sys

import pandas as pd

src = sys.argv[1] if len(sys.argv) > 1 else "data/5g_coverage_clean.csv"
dst = sys.argv[2] if len(sys.argv) > 2 else "frontend/public/data/points.json"

df = pd.read_csv(src)
operators = sorted(df["operator"].unique(), key=str.lower)
statuses = ["Commercial", "Pre-release", "Limited"]
places = sorted(df["city_name"].astype(str).unique())

op_id = {o: i for i, o in enumerate(operators)}
st_id = {s: i for i, s in enumerate(statuses)}
pl_id = {p: i for i, p in enumerate(places)}

payload = {
    "operators": operators,
    "statuses": statuses,
    "places": places,
    "lat": df["latitude"].round(5).tolist(),
    "lng": df["longitude"].round(5).tolist(),
    "op": df["operator"].map(op_id).tolist(),
    "st": df["status"].map(st_id).tolist(),
    "pl": df["city_name"].astype(str).map(pl_id).tolist(),
}
with open(dst, "w") as f:
    json.dump(payload, f, separators=(",", ":"))
print(f"wrote {len(df)} rows, {len(operators)} operators, {len(places)} places to {dst}")
