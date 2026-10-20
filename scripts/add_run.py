#!/usr/bin/env python3
"""Merge one day's job-search results into data/jobs.json.

Usage:
    python3 scripts/add_run.py run.json            # merge and write
    python3 scripts/add_run.py run.json --dry-run  # validate + show what would change

run.json shape:
{
  "date": "2026-10-21",                  # Cairo local date of the run (YYYY-MM-DD)
  "summary": "ملخص قصير بالعربي المصري",   # optional
  "jobs": [
    {
      "title": "Senior Flutter Developer",  # required
      "company": "Acme",                    # required
      "url": "https://...",                 # required, direct apply/posting link
      "location": "Cairo, Egypt",
      "work_mode": "remote|hybrid|onsite",
      "seniority": "Mid–Senior",
      "salary": "optional text",
      "posted_at": "2026-10-20",            # ISO date or datetime
      "source": "LinkedIn|Indeed|Wuzzuf|Bayt|Company site",
      "why_fit": "ليه مناسبة، بالعربي المصري",
      "top": true                           # strongest 2–3 matches
    }
  ]
}

Jobs already present in any earlier run (same normalized URL, or same
company + title) are dropped so each opening appears once, on the day it
was first found. Runs older than KEEP_DAYS are pruned. Standard library only.
"""
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "jobs.json"
KEEP_DAYS = 90
MODES = {"remote", "hybrid", "onsite"}
TRACKING = re.compile(r"^(utm_|ref|refid|trk|tracking|src|from|gclid|fbclid)", re.I)


def norm_url(url: str) -> str:
    p = urlsplit(url.strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urlunsplit((p.scheme.lower() or "https", p.netloc.lower(), p.path.rstrip("/"), urlencode(q), ""))


def norm_text(s: str) -> str:
    return re.sub(r"[^a-z0-9؀-ۿ]+", " ", (s or "").lower()).strip()


def job_id(job: dict) -> str:
    return hashlib.sha1(norm_url(job["url"]).encode()).hexdigest()[:12]


def clean_job(raw: dict, i: int) -> dict:
    missing = [k for k in ("title", "company", "url") if not str(raw.get(k, "")).strip()]
    if missing:
        raise ValueError(f"job #{i}: missing {', '.join(missing)}")
    if not re.match(r"^https?://", raw["url"].strip()):
        raise ValueError(f"job #{i}: url must start with http(s)://")
    job = {k: (v.strip() if isinstance(v, str) else v) for k, v in raw.items() if v not in (None, "", [])}
    job["url"] = norm_url(job["url"])
    mode = str(job.get("work_mode", "")).lower().replace("on-site", "onsite").replace("on site", "onsite")
    if mode in MODES:
        job["work_mode"] = mode
    else:
        job.pop("work_mode", None)
    job["top"] = bool(job.get("top"))
    job["id"] = job_id(job)
    return job


def load_store() -> dict:
    if DATA.exists():
        return json.loads(DATA.read_text(encoding="utf-8"))
    return {"updated_at": None, "runs": []}


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    run = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    dry = "--dry-run" in argv

    date = str(run.get("date", "")).strip()
    dt.date.fromisoformat(date)  # raises if malformed
    jobs = [clean_job(j, i) for i, j in enumerate(run.get("jobs") or [])]

    store = load_store()
    runs = [r for r in store.get("runs", []) if r.get("date") != date]
    same_day = next((r for r in store.get("runs", []) if r.get("date") == date), None)

    seen_ids, seen_pairs = set(), set()
    for r in runs:
        for j in r.get("jobs", []):
            seen_ids.add(j.get("id") or job_id(j))
            seen_pairs.add((norm_text(j.get("company")), norm_text(j.get("title"))))

    merged, dropped = [], []
    # Re-running the same day merges with what that day already had.
    for j in (same_day or {}).get("jobs", []) + jobs:
        pair = (norm_text(j["company"]), norm_text(j["title"]))
        if j["id"] in seen_ids or pair in seen_pairs:
            dropped.append(j)
            continue
        seen_ids.add(j["id"])
        seen_pairs.add(pair)
        merged.append(j)

    new_run = {"date": date, "jobs": merged}
    summary = run.get("summary") or (same_day or {}).get("summary")
    if summary:
        new_run["summary"] = summary

    cutoff = (dt.date.fromisoformat(date) - dt.timedelta(days=KEEP_DAYS)).isoformat()
    runs = [r for r in runs if r.get("date", "") >= cutoff] + [new_run]
    runs.sort(key=lambda r: r["date"], reverse=True)

    out = {"updated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "runs": runs}
    print(f"{date}: {len(merged)} jobs kept, {len(dropped)} duplicates dropped, {len(runs)} runs in archive")
    for j in dropped:
        print(f"  dup: {j['company']} — {j['title']}")
    if dry:
        return 0
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (ValueError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)
