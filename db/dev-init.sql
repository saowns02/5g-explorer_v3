-- Run by the dev compose file on first start: a separate database for pytest.
CREATE DATABASE fiveg_test;
\c fiveg_test
CREATE EXTENSION IF NOT EXISTS postgis;
