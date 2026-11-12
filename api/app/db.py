"""Connection pool and the shared filter clause."""
import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres@localhost:5432/fiveg")
POOL_MIN = int(os.environ.get("DB_POOL_MIN", "2"))
POOL_MAX = int(os.environ.get("DB_POOL_MAX", "10"))

pool = ConnectionPool(
    DATABASE_URL,
    min_size=POOL_MIN,
    max_size=POOL_MAX,
    kwargs={"row_factory": dict_row},
    open=False,
    check=ConnectionPool.check_connection,
    max_idle=60,
)

# Column names can't be bound as parameters, so resolution maps through
# this whitelist and nothing user-supplied reaches the SQL text.
H3_COLUMN = {2: "h3_r2", 3: "h3_r3", 4: "h3_r4"}


def filter_clause(operators: list[str], statuses: list[str]) -> tuple[str, dict]:
    """WHERE fragment shared by every aggregate query."""
    parts, params = ["TRUE"], {}
    if operators:
        parts.append("operator = ANY(%(operators)s)")
        params["operators"] = operators
    if statuses:
        parts.append("status = ANY(%(statuses)s)")
        params["statuses"] = statuses
    return " AND ".join(parts), params
