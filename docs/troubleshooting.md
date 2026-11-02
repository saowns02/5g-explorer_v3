# Troubleshooting log

Add every problem the day it happens, newest first. The two strongest entries go in the slides.

| Date | Owner | Symptom | Hypothesis | What we checked | Fix | Lesson |
|------|-------|---------|------------|-----------------|-----|--------|
| 2026-10-28 | Sab | Font fell back to Arial when offline | Fonts loaded from Google Fonts at runtime | Page in a sandbox with no internet | Bundle Archivo with `@fontsource-variable/archivo` | Anything the VMs need must ship in the build |
| 2026-10-28 | Sab | API latency tile showed p95 of 17 s in live mode | Browser main thread busy drawing the globe, inflating a stopwatch around `fetch()` | Same calls with `curl` took 0.02 to 0.3 s | Measure with the Resource Timing API (network time only) | Measure latency where it happens; client stopwatches include rendering |
| 2026-10-28 | Sab | Densest cells labelled with obscure villages ("Aalen", "Adamov") | Most places tie on record count, so the alphabetical tie-break decided the label | Compared with the mock, which kept file order | Break ties by earliest row (`min(id)`); the source lists major places first | Check tie-breaks whenever a "top" item is shown |
