"""Data validation for the CI 'validate data' stage.

Runs on the cleaned CSV, no database needed:
    pytest db/tests

Set CLEAN_CSV to point at another file, and EXPECTED_ROWS when the source
dataset changes (the newer 5g_coverage.csv gives a slightly higher count).
"""
import os
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
CLEAN_CSV = Path(os.environ.get("CLEAN_CSV", ROOT / "data" / "5g_coverage_clean.csv"))
OPERATORS_FILE = ROOT / "db" / "operators.txt"
EXPECTED_ROWS = int(os.environ.get("EXPECTED_ROWS", "144449"))
ROW_TOLERANCE = 100  # newer file adds a few dozen rows


@pytest.fixture(scope="module")
def df():
    return pd.read_csv(CLEAN_CSV)


def test_row_count(df):
    assert abs(len(df) - EXPECTED_ROWS) <= ROW_TOLERANCE, len(df)


def test_no_duplicates(df):
    assert not df.duplicated(subset=["operator", "latitude", "longitude"]).any()


def test_coordinates_in_range(df):
    assert df["latitude"].between(-90, 90).all()
    assert df["longitude"].between(-180, 180).all()
    assert df[["latitude", "longitude"]].notna().all().all()


def test_statuses(df):
    assert set(df["status"]) <= {"Commercial", "Pre-release", "Limited"}


def test_operators_in_agreed_list(df):
    agreed = {line.strip() for line in OPERATORS_FILE.read_text(encoding="utf-8").splitlines() if line.strip()}
    unknown = set(df["operator"]) - agreed
    assert not unknown, f"operators not in db/operators.txt: {sorted(unknown)}"


def test_operator_names_trimmed(df):
    assert (df["operator"] == df["operator"].str.strip()).all()
