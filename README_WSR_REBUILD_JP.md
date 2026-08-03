# ASICS Skateboarding Dashboard — WSR Rebuild

## What changed

- The former LA28 qualification scoreboard has been removed.
- LA28 remains only as a countdown to the Olympic Games opening date.
- The ranking section is now the official **World Skateboarding Ranking (WSR)**.
- Rider cards and rider detail pages display only verified WSR values. Placeholder rankings are hidden.
- AI UPDATE checks rankings only against the official World Skate / Wyldata source.
- No qualification cut line, quota prediction, or Olympic qualification status is displayed.

## Upload

Upload the contents of this folder to the repository root and overwrite matching files. The full package contains the current content JSON files. If you have already edited riders, calendar, or footage in CMS, keep your existing copies of those three files and overwrite only:

- `index.html`
- `content/site.json`
- `admin/config.yml`
- `ai-admin/index.html`
- `netlify/functions/ai-research.mjs`

Then commit and redeploy Netlify.

## First WSR sync

1. Open `/ai-admin/`.
2. Leave only **Official WSR ranking** checked.
3. Search latest updates.
4. Review exact names, category, rank, points and official source.
5. Approve selected updates.

Official source: https://www.worldskate.org/skateboarding/ranking-wsr.html
