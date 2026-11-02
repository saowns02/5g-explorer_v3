-- 5G Globe Explorer database schema (PostgreSQL 16 + PostGIS 3.4).
-- Safe to re-run: drops and recreates the table. The loader (db/load.py)
-- applies this file before every full load.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS places;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations (
    id           integer PRIMARY KEY,
    operator     text             NOT NULL,
    city_name    text             NOT NULL,
    status       text             NOT NULL
                 CHECK (status IN ('Commercial', 'Pre-release', 'Limited')),
    latitude     double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude    double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    zero_coord   boolean          NOT NULL DEFAULT false,
    -- One id per distinct coordinate pair, so "locations" is a cheap
    -- COUNT(DISTINCT loc_id) instead of a distinct over two floats.
    loc_id       integer          NOT NULL,
    geom         geography(Point, 4326) NOT NULL,
    -- H3 cells precomputed by the loader for the resolutions the globe uses.
    h3_r2        text             NOT NULL,
    h3_r3        text             NOT NULL,
    h3_r4        text             NOT NULL,
    -- A place = one city name (ignoring case and accents) inside one H3
    -- resolution-3 cell (about 60 km across). That keeps same-named towns in
    -- different regions apart while merging the small coordinate differences
    -- between operators.
    -- place_id is the id of the place's first row in the CSV.
    place_id     integer          NOT NULL,
    UNIQUE (operator, latitude, longitude)
);

-- Spatial index (the brief's GiST requirement): serves /nearby and the
-- spatial-query KPI measured with EXPLAIN ANALYZE.
CREATE INDEX locations_geom_gist ON locations USING gist (geom);

-- Aggregation and filter indexes for /hexes, /cells and /top-cells.
CREATE INDEX locations_h3_r2 ON locations (h3_r2);
CREATE INDEX locations_h3_r3 ON locations (h3_r3);
CREATE INDEX locations_h3_r4 ON locations (h3_r4);
CREATE INDEX locations_operator ON locations (operator);
CREATE INDEX locations_status ON locations (status);
CREATE INDEX locations_place ON locations (place_id);

-- One row per place, built by the loader from locations. Serves /places.
CREATE TABLE places (
    id         integer PRIMARY KEY,
    name       text             NOT NULL,
    -- lower case, accents removed: "São Paulo" -> "sao paulo"
    search_key text             NOT NULL,
    lat        double precision NOT NULL,
    lng        double precision NOT NULL,
    records    integer          NOT NULL,
    operators  text[]           NOT NULL
);
CREATE INDEX places_search_trgm ON places USING gin (search_key gin_trgm_ops);
