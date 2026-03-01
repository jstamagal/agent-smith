# Trendshift Reporting Pipeline

This project includes a daily autonomous Trendshift intelligence pipeline that scrapes Trendshift pages, stores historical structured data, updates a rolling interest profile, and generates a daily report.

## Schedule and timezone behavior (EST/EDT)

Cron entry in `config/CRONS.json`:

- `name`: `Trendshift Daily Scrape`
- `schedule`: `30 8 * * *`
- `type`: `agent`
- `enabled`: `true`

### How EST/EDT alignment is handled

The configured cron expression is `30 8 * * *`, which means "8:30" in the event-handler scheduler timezone.

- If your event-handler/runtime timezone is set to `America/New_York`, this naturally runs at **8:30 AM Eastern** year-round and automatically follows DST (EST/EDT).
- If your server uses another local timezone (for example UTC), set the event-handler container/process timezone to `America/New_York` so that cron execution remains 8:30 AM Eastern across DST transitions.

Recommended deployment setting (Docker/event-handler): set `TZ=America/New_York` for the event-handler service/process.

## Data storage layout

Daily artifacts are written under `data/trendshift/`:

- Raw source captures (date-stamped, no overwrite of older days):
  - `data/trendshift/raw/YYYY-MM-DD/main-page.*`
  - `data/trendshift/raw/YYYY-MM-DD/github-trending.*`
- Normalized daily records:
  - `data/trendshift/normalized/YYYY-MM-DD.json`
- Long-running append-only history:
  - `data/trendshift/history.jsonl`
- Rolling personalization state:
  - `data/trendshift/interest_profile.json`
- Human-readable daily report:
  - `data/trendshift/reports/YYYY-MM-DD.md`

## High-level data format

## Raw files
Raw files are source snapshots for traceability/auditing. Extension may vary by extraction mode (e.g., `.html`, `.json`, `.md`).

## Normalized daily JSON (`normalized/YYYY-MM-DD.json`)
Array of trend items with best-effort fields such as:

- `name`
- `url`
- `description`
- `language` / `topics` / `category`
- `stars`, `growth`, `rank`, `timeframe`, `momentum` (when visible)
- `source_page` (e.g., `main-page`, `github-trending-repositories`)
- `scraped_at` (ISO timestamp)
- `date` (YYYY-MM-DD)

## History JSONL (`history.jsonl`)
One normalized item per line (JSON object), appended each day.

Deduplication rule is based on a stable identity such as:

- `date`
- `source_page`
- canonical item identity (`url` or normalized name key)

This keeps reruns idempotent and avoids duplicate entries for the same item/day/source.

## Interest profile update model

`data/trendshift/interest_profile.json` stores transparent personalization heuristics derived from historical observations.

Expected profile elements include:

- weighted interests (topics/languages/repo types)
- momentum-affinity signals (e.g., preference for sustained growth vs. sharp spikes)
- `last_updated` timestamp
- short rationale notes explaining notable score/weight changes

Update behavior:

1. Read recent + historical normalized data
2. Recompute/adjust weights from recurring patterns
3. Incorporate momentum signals
4. Write updated profile with rationale and timestamp

## Report content

Each daily report (`reports/YYYY-MM-DD.md`) includes:

1. **Top movers today**
2. **New/emerging themes**
3. **Consistent trends across recent days**
4. **Organized for you** (personalized using `interest_profile.json`)

## How to request reports in chat

Examples:

- "Give me today’s Trendshift report"
- "Give me a weekly Trendshift summary"
- "Focus on AI infra trends this week"
- "Show consistent GitHub trend themes over the past 14 days"
- "Organize today’s Trendshift highlights for my interests"

Tip: You can ask for custom slices (time window, topic/language filters, or momentum-focused ranking) using the historical files in `data/trendshift/`.
