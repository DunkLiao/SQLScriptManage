# Performance Test Data

Generated files for SQLScriptManage performance validation.

- performance-large-backup.json: full restore fixture with 180 versions. Use full restore/import, preferably with clear existing data in a disposable browser profile.
- big-diff-from.sql: large source SQL used by version perf_v_179.
- big-diff-to.sql: large target SQL used by version perf_v_180.

Suggested checks:
1. Restore performance-large-backup.json.
2. Confirm the version list initially shows the first page and a load-more button.
3. Open diff.html?from=perf_v_179&to=perf_v_180.
4. Confirm the diff page shows loading states and completes the large diff.
