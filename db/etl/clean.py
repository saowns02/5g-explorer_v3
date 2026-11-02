"""Clean the raw 5G coverage CSV using the rules agreed in the project spec.

Usage:
    python db/etl/clean.py data/5g_coverage.csv data/5g_coverage_clean.csv

The output is the single source of truth for both the PostgreSQL loader and
the frontend mock data export (export_frontend.py).
"""
import sys

import pandas as pd

OPERATOR_MERGES = {
    "Telsta": "Telstra",
    "Sasktel": "SaskTel",
    "Tele 2": "Tele2",
    "Megafon": "MegaFon",
    "epic": "Epic",
    "Ice": "ICE",
    "lliad": "Iliad",
    "Jio": "Reliance Jio",
}

DEPLOYMENT_FIXES = {"5GNR": "5G NR", "5g NR": "5G NR", "5N NR": "5G NR", "5G": "5G NR"}

STATUS_MAP = {
    "Commercial Availability": "Commercial",
    "Pre-Release": "Pre-release",
    "Limited Availability": "Limited",
}


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report = {"raw_rows": len(df)}

    # 1. Trim whitespace in operator and city names.
    df["operator"] = df["operator"].astype(str).str.strip()
    df["city_name"] = df["city_name"].astype(str).str.strip()
    report["raw_operators"] = df["operator"].nunique()

    # 2. Merge operator spelling variants.
    df["operator"] = df["operator"].replace(OPERATOR_MERGES)

    # 3. Normalise deployment_type typos.
    df["deployment_type"] = df["deployment_type"].str.strip().replace(DEPLOYMENT_FIXES)

    # Normalise status labels to the three values the app filters on.
    df["status"] = df["status"].str.strip().map(STATUS_MAP).fillna(df["status"])

    # 4. Drop duplicates on operator plus coordinates.
    before = len(df)
    df = df.drop_duplicates(subset=["operator", "latitude", "longitude"])
    report["duplicates_dropped"] = before - len(df)

    # 5. Reject out-of-range coordinates and flag exact zeros.
    valid = df["latitude"].between(-90, 90) & df["longitude"].between(-180, 180)
    report["invalid_coords_dropped"] = int((~valid).sum())
    df = df[valid].copy()
    df["zero_coord_flag"] = (df["latitude"] == 0) | (df["longitude"] == 0)
    report["zero_coord_flagged"] = int(df["zero_coord_flag"].sum())

    report["clean_rows"] = len(df)
    report["clean_operators"] = df["operator"].nunique()
    report["status_counts"] = df["status"].value_counts().to_dict()
    return df.reset_index(drop=True), report


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "data/5g_coverage.csv"
    dst = sys.argv[2] if len(sys.argv) > 2 else "data/5g_coverage_clean.csv"
    cleaned, rep = clean(pd.read_csv(src))
    cleaned.to_csv(dst, index=False)
    for k, v in rep.items():
        print(f"{k}: {v}")
