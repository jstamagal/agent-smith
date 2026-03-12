# Trendshift Reporting

This document describes the Trendshift daily collection/reporting contract and how chat can reliably fetch the latest polished report.

## File layout

All reporting artifacts live under:

- `data/trendshift/`

Structure:

- `raw/YYYY-MM-DD/`
  - Source snapshots captured for that day (one file per source), for example:
    - `explore_front_page.json`
    - `github_trending.json`
- `normalized/YYYY-MM-DD.json`
  - Canonical normalized dataset for that day.
- `reports/YYYY-MM-DD.md`
  - Human-readable report for that day.
- `reports/latest.md`
  - Canonical pointer to the newest report markdown.
- `latest.json`
  - Canonical machine-friendly summary of the newest report.
- `history.jsonl`
  - Append-only run history (one JSON object per line).
- `interest_profile.json`
  - Persistent personalization profile used to organize results “for you”.

## Daily schedule and timezone behavior

Cron entry in `config/CRONS.json`:

- Name: `Trendshift Daily Scrape`
- Enabled: `true`
- Type: `command`
- Command: `node trendshift-reporting.js --scheduled`
- Schedule: `*/30 * * * *`

Why half-hour cron instead of a fixed UTC hour:

- `node-cron` may run in server-local timezone depending on deployment configuration.
- To make behavior robust across environments and DST transitions, the job wakes every 30 minutes and **self-gates** in code.
- The script only performs collection when New York local time is exactly **08:30** in `America/New_York`.

This guarantees 8:30 AM US Eastern behavior with automatic EST/EDT adjustment via IANA timezone rules.

## Immediate/manual run

To run now (without waiting for cron):

```bash
node cron/trendshift-reporting.js --force
```

Notes:

- `--force` regenerates today’s report and refreshes `reports/latest.md` + `latest.json`.
- Scheduled mode (`--scheduled`) exits unless current New York time is exactly 08:30.

## High-level schema (expected)

### `normalized/YYYY-MM-DD.json`

High-level fields:

- `schemaVersion`, `date`, `generatedAt`, `timezone`
- `sources` (source endpoints used)
- `explore[]` (front-page items with stable fields such as title/url/points/comments and optional deltas)
- `github[]` (repo items with title/url/language/stars/forks and optional deltas)
- `themes[]` (scored keywords)
- `emergingThemes[]` (theme momentum view)
- `personalized[]` (items ranked by profile affinity)

### `latest.json`

High-level fields:

- `schemaVersion`, `date`, `generatedAt`, `timezone`
- `reportPath`, `latestReportPath`
- `topTrends[]`
- `exploreHighlights[]`
- `githubHighlights[]`
- `topMovers[]`
- `personalized[]`

Use this as the fast machine interface for chat/API responses.

### `history.jsonl`

One JSON object per run, including:

- event metadata (`event`, `date`, `generatedAt`, `timezone`)
- `baseline` (true when no prior-day snapshot exists for momentum comparisons)
- item counts and artifact paths

## Report format standard

Each daily markdown report includes the same sections in order:

1. Executive summary
2. Front page (explore) highlights
3. GitHub trending repositories highlights
4. Top movers / momentum
5. Emerging themes
6. Organized for you (personalized)

Formatting conventions:

- concise bullets for summary
- markdown tables for highlights/movers/themes/personalized picks
- explicit source links for every listed item

## Personalization update model

`interest_profile.json` is updated on each successful run.

At a high level:

1. Existing keyword weights decay slightly (prevents stale lock-in).
2. Emerging themes get a weighted boost.
3. Featured high-signal items contribute additional keyword boosts.
4. Keywords are sorted/truncated to keep the profile compact.

This makes personalization adaptive over time while remaining stable enough for consistent daily ranking.

## How chat should use latest artifacts

For fast, reliable responses:

1. Read `data/trendshift/latest.json` first (machine summary, quick extraction).
2. If a polished narrative is requested, read `data/trendshift/reports/latest.md`.
3. If deeper detail is needed, read `data/trendshift/normalized/<date>.json` referenced by `latest.json`.

This separation ensures low-latency structured answers plus high-quality user-facing markdown.
