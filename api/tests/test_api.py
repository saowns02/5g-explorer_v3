import h3

LONDON_R3 = h3.latlng_to_cell(51.5072, -0.1276, 3)
PARIS_R3 = h3.latlng_to_cell(48.8566, 2.3522, 3)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_meta_totals(client):
    body = client.get("/meta").json()
    assert body["totals"] == {"records": 9, "operators": 9, "locations": 8}
    assert [s["name"] for s in body["statuses"]] == ["Commercial", "Pre-release", "Limited"]
    assert sum(o["records"] for o in body["operators"]) == 9


def test_hexes_shape(client):
    body = client.get("/hexes", params={"res": 3}).json()
    assert body["res"] == 3
    assert body["totals"]["records"] == 9
    assert body["totals"]["cells"] == len(body["hexes"])
    hexes = {h["h3"]: h for h in body["hexes"]}
    london = hexes[LONDON_R3]
    assert set(london) == {"h3", "lat", "lng", "records", "locations", "operators"}
    assert london["records"] >= 2 and london["operators"] >= 2


def test_hexes_operator_filter(client):
    body = client.get("/hexes", params={"res": 3, "operators": "EE,Orange"}).json()
    assert body["totals"] == {"records": 2, "operators": 2, "locations": 2, "cells": 2}


def test_hexes_status_filter(client):
    body = client.get("/hexes", params={"res": 2, "statuses": "Pre-release,Limited"}).json()
    assert body["totals"]["records"] == 2


def test_unknown_status_rejected(client):
    assert client.get("/hexes", params={"statuses": "Live"}).status_code == 422


def test_resolution_bounds(client):
    assert client.get("/hexes", params={"res": 7}).status_code == 422


def test_cell_detail(client):
    body = client.get(f"/cells/{PARIS_R3}", params={"res": 3}).json()
    assert body["records"] == 2
    assert {o["name"] for o in body["operators"]} == {"Orange", "Free Mobile"}
    assert abs(sum(o["share"] for o in body["operators"]) - 1) < 1e-9
    assert body["places"][0]["name"] == "Paris"
    assert body["placeCount"] == 1


def test_cell_wrong_resolution(client):
    assert client.get(f"/cells/{PARIS_R3}", params={"res": 2}).status_code == 422


def test_top_cells(client):
    rows = client.get("/top-cells", params={"res": 3, "limit": 2}).json()
    assert len(rows) == 2
    assert rows[0]["records"] >= rows[1]["records"]
    assert rows[0]["place"] and rows[0]["topOperator"]


def test_nearby_uses_distance(client):
    body = client.get("/nearby", params={"lat": 51.5072, "lng": -0.1276, "km": 5}).json()
    assert body["count"] == 2  # the two London rows, not Croydon (about 15 km away)
    assert all(r["km"] < 5 for r in body["results"])


def test_place_search_ignores_accents_and_merges_spellings(client):
    rows = client.get("/places", params={"q": "zurich"}).json()
    swiss = [r for r in rows if r["lng"] > 0]
    assert len(swiss) == 1  # "Zürich" and "Zurich" in the same area are one place
    assert swiss[0]["operators"] == 2
    assert any(r["lng"] < 0 for r in rows)  # Zurich, Ontario stays separate


def test_place_search_ranks_exact_then_prefix(client):
    rows = client.get("/places", params={"q": "par"}).json()
    assert rows[0]["name"] == "Paris"
    assert set(rows[0]) == {"id", "name", "lat", "lng", "records", "operators", "topOperators"}


def test_place_search_needs_two_characters(client):
    assert client.get("/places", params={"q": "z"}).status_code == 422


def test_place_detail_at_place_and_nearby(client):
    london = client.get("/places", params={"q": "london"}).json()[0]
    body = client.get(f"/places/{london['id']}", params={"km": 5}).json()
    assert body["atPlace"]["operators"] == ["EE", "O2"]
    assert body["nearby"]["records"] == 2  # Croydon is about 15 km away
    wide = client.get(f"/places/{london['id']}", params={"km": 25}).json()
    assert wide["nearby"]["records"] == 3
    assert wide["nearby"]["places"] == 2
    assert abs(sum(o["share"] for o in wide["nearby"]["operators"]) - 1) < 1e-9


def test_place_not_found(client):
    assert client.get("/places/999999").status_code == 404
