# WSR Direct Parser Patch

The previous background version completed but returned zero candidates because it asked an AI web-search response to interpret an entire dynamic leaderboard. This patch removes AI from WSR rank extraction.

## Upload / overwrite

- `ai-admin/index.html`
- `netlify/functions/wsr-research-background.mjs`

`wsr-research-status.mjs` may be uploaded again but is unchanged.

## What changes

- Reads four official Wyldata URLs separately:
  - Men Street: `?discipline=2&gender=1`
  - Women Street: `?discipline=2&gender=0`
  - Men Park: `?discipline=1&gender=1`
  - Women Park: `?discipline=1&gender=0`
- Matches exact dashboard rider names.
- Extracts rank and total points deterministically.
- Shows how many dashboard riders were actually matched.
- Creates a candidate only when official values differ or dashboard values are blank.
- Uses a rendered-reader fallback only when Wyldata's direct HTML does not contain the live table.

## After upload

1. Commit to GitHub.
2. Netlify → Deploys → Trigger deploy → Deploy project.
3. Open `/ai-admin/` and hard-refresh.
4. Select only Official WSR ranking.
5. Search.
6. Do not approve unless rider, discipline, rank and points look correct.
