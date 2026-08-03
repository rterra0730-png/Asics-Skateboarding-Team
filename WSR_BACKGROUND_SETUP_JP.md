# WSR Background Update Patch

This update moves Official WSR research to a Netlify Background Function.

## Upload / overwrite

- `ai-admin/index.html`
- `netlify/functions/wsr-research-background.mjs`
- `netlify/functions/wsr-research-status.mjs`

The existing `ai-research.mjs`, `ai-apply.mjs`, `_shared.mjs`, `index.html`, and content JSON files remain unchanged.

## After commit

1. Netlify Deploys → Trigger deploy → Deploy project.
2. Open `/ai-admin/`.
3. Select only `Official WSR ranking`.
4. Click `SEARCH LATEST UPDATES`.
5. Keep the tab open while it polls the background job.
6. Review and approve candidates.

Background results are temporarily stored in `content/ai-jobs/wsr-latest.json`. This contains public ranking candidates only and no secret values.
