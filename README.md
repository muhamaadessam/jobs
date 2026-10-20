# Flutter Jobs

Daily Flutter job openings for Egypt + remote, live at **https://jobs.muhammadessam.me**.

A scheduled Claude task runs Sunday–Thursday at 11:35 Cairo time. It searches Indeed, LinkedIn, Wuzzuf, Bayt and company career pages, writes the day's picks as JSON, merges them with `scripts/add_run.py`, and pushes to `main`. GitHub Pages redeploys the site automatically.

## Layout

```
index.html            page shell (Arabic, RTL)
assets/style.css      styles, light + dark
assets/app.js         loads data/jobs.json, filters, per-browser "applied"/"hidden" marks
data/jobs.json        all runs, newest first (last 90 days)
scripts/add_run.py    validates a run, drops duplicates, merges into data/jobs.json
CNAME                 custom domain for GitHub Pages
```

## Adding a run by hand

```bash
python3 scripts/add_run.py run.json --dry-run   # check
python3 scripts/add_run.py run.json             # write data/jobs.json
```

`run.json` shape is documented at the top of `scripts/add_run.py`. A job needs at least `title`, `company` and `url`; any opening already in an earlier run (same URL or same company + title) is dropped.

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

"Applied" and "hidden" marks are stored in your browser only (localStorage), so they don't sync between devices.
