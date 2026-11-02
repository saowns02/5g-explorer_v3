"""Load test for the 5G Globe Explorer API (KPIs: latency p50/p95, throughput).

Each simulated user behaves like someone using the globe: loads the stats,
spins the globe at different zoom levels, filters by operator, opens cells,
searches for places and compares radii. Weights reflect how often the real
frontend makes each call.

Run through kpi/run_load.sh so every run is recorded with its settings, or
directly:
    locust -f kpi/locustfile.py --host http://<web-address>/api --headless -u 50 -r 10 -t 3m
"""
import random

from locust import HttpUser, between, task

OPERATORS = ["EE", "Vodafone", "Orange", "Free Mobile", "AT&T Mobility", "Verizon Wireless", "Telstra", "Swisscom"]
PLACE_QUERIES = ["london", "paris", "berlin", "birmingham", "madrid", "zurich", "new york", "sydney", "milan", "lyon"]
POINTS = [(51.507, -0.128), (48.857, 2.352), (52.520, 13.405), (40.713, -74.006), (45.464, 9.190), (47.377, 8.541)]


class GlobeUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        self.client.get("/meta", name="/meta")
        self.cells = {2: [], 3: [], 4: []}
        self.place_ids = []

    def _hexes(self, res, **params):
        params = {"res": res, **params}
        with self.client.get("/hexes", params=params, name=f"/hexes res={res}", catch_response=True) as r:
            if r.ok:
                hexes = r.json()["hexes"]
                if hexes:
                    self.cells[res] = [h["h3"] for h in random.sample(hexes, min(20, len(hexes)))]

    @task(4)
    def globe_zoomed_out(self):
        self._hexes(2)

    @task(2)
    def globe_mid_zoom(self):
        self._hexes(3)

    @task(1)
    def globe_close_zoom(self):
        self._hexes(4)

    @task(2)
    def filter_by_operator(self):
        self._hexes(random.choice([2, 3]), operators=random.choice(OPERATORS))

    @task(2)
    def densest_cells(self):
        self.client.get("/top-cells", params={"res": random.choice([2, 3]), "limit": 5}, name="/top-cells")

    @task(3)
    def open_cell(self):
        res = random.choice([r for r in (2, 3, 4) if self.cells[r]] or [None])
        if res is None:
            return self._hexes(2)
        self.client.get(f"/cells/{random.choice(self.cells[res])}", params={"res": res}, name="/cells/{h3}")

    @task(3)
    def search_place(self):
        q = random.choice(PLACE_QUERIES)
        prefix = q[: random.randint(3, len(q))]
        with self.client.get("/places", params={"q": prefix}, name="/places", catch_response=True) as r:
            if r.ok and r.json():
                self.place_ids = [p["id"] for p in r.json()[:3]]

    @task(2)
    def place_detail(self):
        if not self.place_ids:
            return self.search_place()
        self.client.get(
            f"/places/{random.choice(self.place_ids)}", params={"km": random.choice([10, 25, 50])}, name="/places/{id}"
        )

    @task(1)
    def spatial_nearby(self):
        lat, lng = random.choice(POINTS)
        self.client.get("/nearby", params={"lat": lat, "lng": lng, "km": random.choice([5, 10, 25])}, name="/nearby")
