Generate an immediate Trendshift report for chat delivery.

1) Read existing artifacts if present:
- data/trendshift/reports/latest.md
- data/trendshift/latest.json
- latest dated files in data/trendshift/reports/ and data/trendshift/normalized/

2) If missing/stale, immediately scrape:
- https://trendshift.io
- https://trendshift.io/github-trending-repositories

3) Produce:
- data/trendshift/chat-report-latest.md (pretty, readable, organized report with:
  - Executive summary
  - Explore/front-page trends
  - GitHub trending repos
  - Top movers/emerging themes
  - Personalized section from interest_profile if available)
- data/trendshift/chat-report-status.json (success/failure + notes)

4) Ensure outputs are usable for future “Give me Trendshift report” requests.