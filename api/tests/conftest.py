"""Tests run against a real PostGIS database loaded from tests/fixture.csv.

Set TEST_DATABASE_URL to an empty database you can drop tables in, e.g.
    TEST_DATABASE_URL=postgresql://postgres@localhost:5432/fiveg_test pytest
The dev compose file creates fiveg_test for you.
"""
import importlib.util
import os
from pathlib import Path

import psycopg
import pytest

TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@localhost:5432/fiveg_test")
os.environ["DATABASE_URL"] = TEST_URL  # before the app's pool is created

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).with_name("fixture.csv")


def _load_module():
    spec = importlib.util.spec_from_file_location("loader", ROOT / "db" / "load.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session", autouse=True)
def database():
    with psycopg.connect(TEST_URL) as conn:
        _load_module().load(conn, FIXTURE)
    yield


@pytest.fixture(scope="session")
def client(database):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
