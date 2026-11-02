"""Summarise KPI results: mean and standard deviation per environment.

    python kpi/summarise.py            # reads results/, writes results/summary.csv and prints a table

Reads Locust's *_stats.csv (Aggregated row of each run), query-timing CSVs,
recovery.csv and scaling.csv. Paste the printed table into the slides.
"""
import csv
import statistics
from collections import defaultdict
from pathlib import Path

RESULTS = Path(__file__).resolve().parents[1] / "results"


def ms(values):
    if not values:
        return "", ""
    mean = statistics.mean(values)
    sd = statistics.stdev(values) if len(values) > 1 else 0.0
    return f"{mean:.1f}", f"{sd:.1f}"


def load_runs():
    out = defaultdict(lambda: defaultdict(list))
    for stats in sorted(RESULTS.glob("*/*-load-run*_stats.csv")):
        env = stats.parent.name
        with stats.open() as f:
            for row in csv.DictReader(f):
                if row["Name"] == "Aggregated":
                    out[env]["p50"].append(float(row["50%"]))
                    out[env]["p95"].append(float(row["95%"]))
                    out[env]["rps"].append(float(row["Requests/s"]))
                    req = float(row["Request Count"]) or 1
                    out[env]["fail_pct"].append(100 * float(row["Failure Count"]) / req)
    return out


def load_queries():
    out = defaultdict(lambda: defaultdict(list))
    for f in sorted(RESULTS.glob("*/*-query-timing.csv")):
        with f.open() as fh:
            rows = [r for r in csv.reader(fh) if r and not r[0].startswith("#")]
        header, data = rows[0], rows[1:]
        for r in map(lambda x: dict(zip(header, x, strict=False)), data):
            out[r["environment"]][r["query"]].append(float(r["execution_ms"]))
    return out


def load_simple(name, column):
    out = defaultdict(list)
    for f in RESULTS.glob(f"*/{name}"):
        with f.open() as fh:
            for r in csv.DictReader(fh):
                out[r["environment"]].append(float(r[column]))
    return out


def main():
    lines = [["kpi", "environment", "runs", "mean", "sd", "unit"]]
    for env, m in sorted(load_runs().items()):
        for key, unit in (("p50", "ms"), ("p95", "ms"), ("rps", "req/s"), ("fail_pct", "%")):
            mean, sd = ms(m[key])
            lines.append([f"api_{key}", env, len(m[key]), mean, sd, unit])
    for env, qs in sorted(load_queries().items()):
        for q, vals in sorted(qs.items()):
            mean, sd = ms(vals)
            lines.append([f"query_{q}", env, len(vals), mean, sd, "ms"])
    for fname, label in (("recovery.csv", "recovery_time"), ("scaling.csv", "scaling_time")):
        for env, vals in sorted(load_simple(fname, "seconds").items()):
            mean, sd = ms(vals)
            lines.append([label, env, len(vals), mean, sd, "s"])

    out = RESULTS / "summary.csv"
    with out.open("w", newline="") as f:
        csv.writer(f).writerows(lines)

    widths = [max(len(str(r[i])) for r in lines) for i in range(len(lines[0]))]
    for r in lines:
        print("  ".join(str(v).ljust(w) for v, w in zip(r, widths, strict=False)))
    print(f"\nSaved {out}")


if __name__ == "__main__":
    main()
