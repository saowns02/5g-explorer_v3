"""5G Globe Explorer API.

Response shapes match frontend/src/api/mock.js exactly, so the frontend
switches from mock to live by setting VITE_API_URL and nothing else.

Run locally:
    DATABASE_URL=postgresql://postgres@localhost:5432/fiveg \
        uvicorn app.main:app --port 8000          (from the api/ folder)
"""
from contextlib import asynccontextmanager
from typing import Annotated

import h3
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse

from .db import H3_COLUMN, filter_clause, pool
from .text import like_escape, search_key

STATUS_ORDER = ["Commercial", "Pre-release", "Limited"]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    pool.open(wait=True, timeout=30)
    yield
    pool.close()


app = FastAPI(title="5G Globe Explorer API", version="0.1.0", lifespan=lifespan)


# ---------- shared parameters ----------

def split_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


class Filters:
    def __init__(
        self,
        res: Annotated[int, Query(ge=2, le=4, description="H3 resolution")] = 3,
        operators: Annotated[str | None, Query(description="Comma-separated operator names")] = None,
        statuses: Annotated[str | None, Query(description="Comma-separated statuses")] = None,
    ):
        self.res = res
        self.col = H3_COLUMN[res]
        self.operators = split_list(operators)
        self.statuses = split_list(statuses)
        bad = set(self.statuses) - set(STATUS_ORDER)
        if bad:
            raise HTTPException(422, f"Unknown status: {', '.join(sorted(bad))}")
        self.where, self.params = filter_clause(self.operators, self.statuses)


def centre(cell: str) -> tuple[float, float]:
    return h3.cell_to_latlng(cell)


# ---------- endpoints ----------

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("docs")


@app.get("/health")
def health():
    with pool.connection() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok", "mode": "live"}


@app.get("/meta")
def meta():
    with pool.connection() as conn:
        totals = conn.execute(
            "SELECT count(*) AS records, count(DISTINCT operator) AS operators, "
            "count(DISTINCT loc_id) AS locations FROM locations"
        ).fetchone()
        operators = conn.execute(
            "SELECT operator AS name, count(*) AS records FROM locations "
            "GROUP BY operator ORDER BY lower(operator)"
        ).fetchall()
        status_rows = conn.execute(
            "SELECT status AS name, count(*) AS records FROM locations GROUP BY status"
        ).fetchall()
    by_name = {r["name"]: r["records"] for r in status_rows}
    statuses = [{"name": s, "records": by_name.get(s, 0)} for s in STATUS_ORDER]
    return {"totals": totals, "operators": operators, "statuses": statuses}


@app.get("/hexes")
def hexes(f: Annotated[Filters, Depends()]):
    with pool.connection() as conn:
        rows = conn.execute(
            f"SELECT {f.col} AS h3, count(*) AS records, count(DISTINCT loc_id) AS locations, "
            f"count(DISTINCT operator) AS operators FROM locations WHERE {f.where} GROUP BY {f.col}",
            f.params,
        ).fetchall()
        totals = conn.execute(
            f"SELECT count(*) AS records, count(DISTINCT operator) AS operators, "
            f"count(DISTINCT loc_id) AS locations FROM locations WHERE {f.where}",
            f.params,
        ).fetchone()
    out = []
    for r in rows:
        lat, lng = centre(r["h3"])
        out.append({"h3": r["h3"], "lat": lat, "lng": lng, "records": r["records"],
                    "locations": r["locations"], "operators": r["operators"]})
    totals["cells"] = len(out)
    return {"res": f.res, "totals": totals, "hexes": out}


def cell_detail(conn, cell: str, f: Filters) -> dict:
    params = {**f.params, "cell": cell}
    where = f"{f.col} = %(cell)s AND {f.where}"
    head = conn.execute(
        f"SELECT count(*) AS records, count(DISTINCT loc_id) AS locations, "
        f"count(DISTINCT city_name) AS place_count FROM locations WHERE {where}",
        params,
    ).fetchone()
    ops = conn.execute(
        f"SELECT operator AS name, count(*) AS records FROM locations WHERE {where} "
        f"GROUP BY operator ORDER BY count(*) DESC, operator",
        params,
    ).fetchall()
    statuses = conn.execute(
        f"SELECT status AS name, count(*) AS records FROM locations WHERE {where} "
        f"GROUP BY status ORDER BY count(*) DESC",
        params,
    ).fetchall()
    # Ties are common (most places have one record per operator). The source
    # file lists major places first, so ties go to the earliest row: this
    # labels a cell "Birmingham" rather than an alphabetically early village.
    clat, clng = centre(cell)
    places = conn.execute(
        f"SELECT city_name AS name, count(*) AS records FROM locations WHERE {where} "
        f"GROUP BY city_name ORDER BY count(*) DESC, min(id) LIMIT 8",
        params,
    ).fetchall()
    total = head["records"]
    for o in ops:
        o["share"] = o["records"] / total if total else 0
    return {
        "h3": cell, "res": f.res, "lat": clat, "lng": clng,
        "records": total, "locations": head["locations"],
        "operators": ops, "statuses": statuses, "places": places,
        "placeCount": head["place_count"],
    }


@app.get("/cells/{cell}")
def cell(cell: str, f: Annotated[Filters, Depends()]):
    if not h3.is_valid_cell(cell) or h3.get_resolution(cell) != f.res:
        raise HTTPException(422, f"{cell} is not a valid H3 cell at resolution {f.res}")
    with pool.connection() as conn:
        return cell_detail(conn, cell, f)


@app.get("/top-cells")
def top_cells(
    f: Annotated[Filters, Depends()],
    limit: Annotated[int, Query(ge=1, le=50)] = 5,
):
    """Densest cells, each labelled with its leading place and operator.
    One query: aggregate, take the top N, then label only those N."""
    col = f.col
    sql = f"""
        WITH f AS (SELECT * FROM locations WHERE {f.where}),
        top_n AS (
            SELECT {col} AS h3, count(*) AS records, count(DISTINCT loc_id) AS locations,
                   count(DISTINCT operator) AS operators
            FROM f GROUP BY {col} ORDER BY count(*) DESC, {col} LIMIT %(limit)s
        ),
        lead_op AS (
            SELECT DISTINCT ON ({col}) {col} AS h3, operator
            FROM f WHERE {col} IN (SELECT h3 FROM top_n)
            GROUP BY {col}, operator ORDER BY {col}, count(*) DESC, operator
        ),
        lead_place AS (
            SELECT DISTINCT ON ({col}) {col} AS h3, city_name
            FROM f WHERE {col} IN (SELECT h3 FROM top_n)
            GROUP BY {col}, city_name ORDER BY {col}, count(*) DESC, min(id)
        )
        SELECT t.*, o.operator AS "topOperator", p.city_name AS place
        FROM top_n t JOIN lead_op o USING (h3) JOIN lead_place p USING (h3)
        ORDER BY t.records DESC, t.h3
    """
    with pool.connection() as conn:
        rows = conn.execute(sql, {**f.params, "limit": limit}).fetchall()
    for r in rows:
        r["lat"], r["lng"] = centre(r["h3"])
    return rows


@app.get("/nearby")
def nearby(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    km: Annotated[float, Query(gt=0, le=200)] = 10,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    """Records within `km` of a point. Uses the GiST index; this is the
    spatial query timed with EXPLAIN ANALYZE for the KPI comparison."""
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT operator, city_name, status, latitude, longitude, "
            "round(ST_Distance(geom, ST_MakePoint(%(lng)s, %(lat)s)::geography)::numeric / 1000, 3) AS km "
            "FROM locations WHERE ST_DWithin(geom, ST_MakePoint(%(lng)s, %(lat)s)::geography, %(m)s) "
            "ORDER BY geom <-> ST_MakePoint(%(lng)s, %(lat)s)::geography LIMIT %(limit)s",
            {"lat": lat, "lng": lng, "m": km * 1000, "limit": limit},
        ).fetchall()
    for r in rows:
        r["km"] = float(r["km"])
    return {"count": len(rows), "results": rows}


# ---------- places ----------

@app.get("/places")
def search_places(
    q: Annotated[str, Query(min_length=2, max_length=80, description="Place name, any case or accents")],
    limit: Annotated[int, Query(ge=1, le=25)] = 8,
):
    """Places whose name contains q. Exact matches first, then names that
    start with q, then larger places (more records)."""
    key = search_key(q)
    if len(key) < 2:
        return []
    esc = like_escape(key)
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, name, lat, lng, records, cardinality(operators) AS operators, "
            "operators[1:3] AS \"topOperators\" FROM places "
            "WHERE search_key LIKE %(contains)s "
            "ORDER BY (search_key = %(key)s) DESC, (search_key LIKE %(prefix)s) DESC, records DESC, id "
            "LIMIT %(limit)s",
            {"contains": f"%{esc}%", "prefix": f"{esc}%", "key": key, "limit": limit},
        ).fetchall()
    return rows


def _share(rows: list[dict]) -> list[dict]:
    total = sum(r["records"] for r in rows)
    for r in rows:
        r["share"] = r["records"] / total if total else 0
    return rows


@app.get("/places/{place_id}")
def place_detail(
    place_id: int,
    km: Annotated[float, Query(gt=0, le=100, description="Radius for the surrounding-area figures")] = 25,
):
    """One place: who reports 5G at the place itself, and what is reported
    within km of it (a GiST-indexed ST_DWithin query)."""
    with pool.connection() as conn:
        place = conn.execute(
            "SELECT id, name, lat, lng, records, operators FROM places WHERE id = %s", (place_id,)
        ).fetchone()
        if place is None:
            raise HTTPException(404, f"No place with id {place_id}")
        at_statuses = conn.execute(
            "SELECT status AS name, count(*) AS records FROM locations WHERE place_id = %s "
            "GROUP BY status ORDER BY count(*) DESC",
            (place_id,),
        ).fetchall()
        near = {"pt": f"SRID=4326;POINT({place['lng']} {place['lat']})", "m": km * 1000}
        within = "ST_DWithin(geom, %(pt)s::geography, %(m)s)"
        head = conn.execute(
            f"SELECT count(*) AS records, count(DISTINCT loc_id) AS locations, "
            f"count(DISTINCT place_id) AS places FROM locations WHERE {within}",
            near,
        ).fetchone()
        ops = conn.execute(
            f"SELECT operator AS name, count(*) AS records FROM locations WHERE {within} "
            f"GROUP BY operator ORDER BY count(*) DESC, operator",
            near,
        ).fetchall()
        statuses = conn.execute(
            f"SELECT status AS name, count(*) AS records FROM locations WHERE {within} "
            f"GROUP BY status ORDER BY count(*) DESC",
            near,
        ).fetchall()
    return {
        "id": place["id"], "name": place["name"], "lat": place["lat"], "lng": place["lng"],
        "atPlace": {"records": place["records"], "operators": place["operators"], "statuses": at_statuses},
        "nearby": {"km": km, **head, "operators": _share(ops), "statuses": statuses},
    }
