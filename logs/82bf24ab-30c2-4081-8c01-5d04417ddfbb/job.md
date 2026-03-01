Set up a daily Trendshift intelligence pipeline.

Goal:
Create/modify configuration so the agent automatically scrapes:
1) https://trendshift.io
2) https://trendshift.io/github-trending-repositories
once per day, stores structured historical data, and maintains a running interest profile to improve future report organization.

Required changes:

1) Update `config/CRONS.json`
- Add (or update if already present) one enabled cron job:
  - `name`: `Trendshift Daily Scrape`
  - `schedule`: `30 8 * * *`
  - `type`: `agent`
  - `enabled`: `true`
  - `job`: an agent prompt that performs the daily scrape + data processing below.
- Keep existing cron entries unchanged.

2) Timezone requirement
- Ensure the daily run time is aligned to US Eastern time with daylight saving behavior (EST/EDT), targeting 8:30 AM Eastern daily.
- If the cron system uses server-local time, implement the schedule so it still executes at 8:30 AM Eastern year-round (including DST transitions), and document how this is handled.

3) Daily scrape job behavior (inside cron `job` text)
The cron agent prompt should instruct Pi to:

- Visit both URLs:
  - https://trendshift.io
  - https://trendshift.io/github-trending-repositories
- Use available scraping approach (browser automation if needed for JS-rendered content).
- Extract useful trend fields where available, such as:
  - item/repo name
  - URL
  - description
  - language/topic/category
  - stars / growth metrics / rank / timeframe (if visible)
  - source page
  - scrape timestamp

- Write date-stamped outputs without overwriting older data:
  - `data/trendshift/raw/YYYY-MM-DD/main-page.*`
  - `data/trendshift/raw/YYYY-MM-DD/github-trending.*`
  - `data/trendshift/normalized/YYYY-MM-DD.json`

- Maintain rolling history:
  - Append normalized records to `data/trendshift/history.jsonl`
  - Avoid duplicate entries for same item/date/source

- Maintain evolving personalization state:
  - `data/trendshift/interest_profile.json`
  - Update profile heuristics from historical patterns (recurring topics, languages, repo types, momentum signals).
  - Keep transparent fields (scores/weights + last-updated timestamp + short rationale notes).

- Generate a daily report file:
  - `data/trendshift/reports/YYYY-MM-DD.md`
  - Include sections:
    - Top movers today
    - New/emerging themes
    - Consistent trends across recent days
    - “Organized for you” section using `interest_profile.json`

4) Add usage docs
Create `docs/trendshift-reporting.md` describing:
- Where daily files are stored
- Data format at a high level
- How the interest profile is updated
- How to request a report in chat (e.g., “give me today’s Trendshift report”, “weekly summary”, “focus on AI infra trends”).
- How EST/EDT scheduling is implemented.

Constraints:
- Preserve existing project behavior and unrelated files.
- Make changes idempotent where practical (safe to run again).
- Keep all existing cron jobs intact.