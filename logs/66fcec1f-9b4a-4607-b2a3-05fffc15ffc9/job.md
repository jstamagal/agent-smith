Harden the Trendshift reporting system so chat requests can reliably return a polished report.

Objectives:
1) Ensure daily collection is configured and robust.
2) Ensure a canonical “latest” report artifact always exists.
3) Run an immediate collection/report pass now so data is available today.
4) Standardize report format for readability and personalization.

Tasks:

1. Verify/fix cron in `config/CRONS.json`
- Ensure `Trendshift Daily Scrape` exists, enabled, and runs at 8:30 AM US Eastern (EST/EDT behavior documented).
- Preserve all other cron entries unchanged.

2. Implement stable output contract under `data/trendshift/`
- Keep dated artifacts:
  - `raw/YYYY-MM-DD/`
  - `normalized/YYYY-MM-DD.json`
  - `reports/YYYY-MM-DD.md`
- Maintain:
  - `history.jsonl`
  - `interest_profile.json`
- Add canonical latest pointers:
  - `reports/latest.md`
  - `latest.json` (machine-friendly summary of current top trends/themes)

3. Improve report quality/format
- Make report sections visually clean and consistent:
  - Executive summary
  - Front page (explore) highlights
  - GitHub trending repositories highlights
  - Top movers / momentum
  - Emerging themes
  - Personalized “organized for you” section based on `interest_profile.json`
- Include concise bullets/tables where appropriate and clear source links.

4. Run one immediate scrape + report generation now
- Execute a one-time run during this job (don’t wait for next cron tick).
- Produce today’s dated report and update `reports/latest.md` + `latest.json`.

5. Documentation
- Update/create `docs/trendshift-reporting.md` with:
  - where files live
  - expected schema at high level
  - how personalization is updated
  - how “latest” artifacts are used for quick chat reporting
  - timezone handling details (EST/EDT)

Constraints:
- Keep unrelated behavior unchanged.
- Idempotent where practical.
- Do not remove existing cron jobs.