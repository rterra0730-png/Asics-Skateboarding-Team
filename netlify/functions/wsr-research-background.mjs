import {
  compactRiders,
  getGithubJson,
  json,
  putGithubJson,
  requireAdminKey,
  requirePost
} from "./_shared.mjs";

const WSR_BASE = "https://wyldata.com/iframes/wsr";
const JOB_PATH = "content/ai-jobs/wsr-latest.json";

const CATEGORIES = [
  { key: "M-STREET", label: "MEN STREET", discipline: "STREET", gender: "M", disciplineId: 2, genderId: 1 },
  { key: "W-STREET", label: "WOMEN STREET", discipline: "STREET", gender: "W", disciplineId: 2, genderId: 0 },
  { key: "M-PARK", label: "MEN PARK", discipline: "PARK", gender: "M", disciplineId: 1, genderId: 1 },
  { key: "W-PARK", label: "WOMEN PARK", discipline: "PARK", gender: "W", disciplineId: 1, genderId: 0 }
];

function categoryUrl(cat) {
  return `${WSR_BASE}?discipline=${cat.disciplineId}&gender=${cat.genderId}`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(div|p|li|tr|td|th|section|article|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
  );
}

function cleanLines(raw) {
  return String(raw || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "\n")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\r?\n/)
    .map(line => line.replace(/[|*`#]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function numericValue(line) {
  const cleaned = String(line || "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseAroundName(lines, riderName) {
  const target = normalizeName(riderName);
  const indexes = [];
  for (let i = 0; i < lines.length; i++) {
    if (normalizeName(lines[i]) === target) indexes.push(i);
  }

  for (const idx of indexes) {
    let points = null;
    let pointsIndex = -1;
    for (let j = idx - 1; j >= Math.max(0, idx - 12); j--) {
      const n = numericValue(lines[j]);
      if (n == null) continue;
      const hasComma = /,/.test(lines[j]);
      if (hasComma || n >= 1000) {
        points = Math.round(n);
        pointsIndex = j;
        break;
      }
    }
    if (points == null) continue;

    let rank = null;
    for (let j = pointsIndex - 1; j >= Math.max(0, pointsIndex - 8); j--) {
      const n = numericValue(lines[j]);
      if (Number.isInteger(n) && n >= 1 && n <= 500) {
        rank = n;
        break;
      }
    }
    if (rank != null) return { rank, points };
  }
  return null;
}

function parseFromCompactText(text, riderName) {
  const escaped = riderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`(?:^|\\s)(\\d{1,3})\\s+([\\d,]{3,})\\s+${escaped}(?:\\s|$)`, "i");
  const match = String(text || "").replace(/\s+/g, " ").match(rx);
  if (!match) return null;
  return { rank: Number(match[1]), points: Number(match[2].replace(/,/g, "")) };
}

async function fetchText(url) {
  const headers = {
    "user-agent": "Mozilla/5.0 (compatible; ASICS-Skateboarding-Team-Sheet/1.0)",
    accept: "text/html,application/xhtml+xml"
  };
  const direct = await fetch(url, { headers, redirect: "follow" });
  if (direct.ok) {
    const html = await direct.text();
    const text = htmlToText(html);
    if (/World Skateboarding Ranking|Top scores past 18 months|Athlete/i.test(text)) {
      return { text, method: "direct", status: direct.status };
    }
  }

  const readerUrl = `https://r.jina.ai/${url}`;
  const rendered = await fetch(readerUrl, {
    headers: { accept: "text/plain", "x-timeout": "30" },
    redirect: "follow"
  });
  if (!rendered.ok) throw new Error(`Wyldata fetch failed (${direct.status}/${rendered.status}) for ${url}`);
  return { text: await rendered.text(), method: "rendered", status: rendered.status };
}

function sameRanking(current, rank, points) {
  const existing = current?.ranking || {};
  return Number(existing.owsrRank) === rank && Number(existing.points) === points && existing.rankPlaceholder !== true;
}

function proposalFor(rider, cat, result, today) {
  const oldRank = rider.ranking?.owsrRank ?? "not set";
  const oldPoints = rider.ranking?.points ?? "not set";
  return {
    id: `wsr-${rider.id}-${today}`,
    action: "update_rider_ranking",
    entityId: rider.id,
    title: `${rider.name}: WSR #${result.rank} · ${result.points.toLocaleString()} pts`,
    reason: `Official ${cat.label} Wyldata WSR differs from the dashboard (${oldRank} / ${oldPoints} pts).`,
    confidence: "high",
    sourceTitle: `Official Wyldata WSR · ${cat.label}`,
    sourceUrl: categoryUrl(cat),
    patch: {
      riderId: rider.id,
      owsrRank: result.rank,
      points: result.points,
      updatedAt: today
    }
  };
}

async function writeJob(data, sha = undefined) {
  return putGithubJson(JOB_PATH, data, sha, `WSR direct research: ${data.status} (${data.jobId})`);
}

export async function handler(event) {
  let jobId = "";
  let existingSha;
  try {
    requirePost(event);
    requireAdminKey(event);
    const body = JSON.parse(event.body || "{}");
    jobId = String(body.jobId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!jobId) return json(400, { error: "Missing jobId." });

    try {
      const existing = await getGithubJson(JOB_PATH);
      existingSha = existing.sha;
    } catch (_) {}

    await writeJob({
      jobId,
      status: "running",
      startedAt: new Date().toISOString(),
      message: "Reading the four official Wyldata WSR tables directly...",
      proposals: [],
      citations: []
    }, existingSha);

    const { data: ridersData } = await getGithubJson("content/riders.json");
    const riders = compactRiders(ridersData);
    const today = new Date().toISOString().slice(0, 10);
    const proposals = [];
    const diagnostics = [];
    const citations = [];

    for (const cat of CATEGORIES) {
      const relevant = riders.filter(r =>
        String(r.discipline || "").toUpperCase() === cat.discipline &&
        String(r.gender || "").toUpperCase() === cat.gender
      );
      const url = categoryUrl(cat);
      const fetched = await fetchText(url);
      const lines = cleanLines(fetched.text);
      let matched = 0;
      const missing = [];

      for (const rider of relevant) {
        const result = parseAroundName(lines, rider.name) || parseFromCompactText(fetched.text, rider.name);
        if (!result) {
          missing.push(rider.name);
          continue;
        }
        matched++;
        if (!sameRanking(rider, result.rank, result.points)) {
          proposals.push(proposalFor(rider, cat, result, today));
        }
      }

      diagnostics.push({
        category: cat.label,
        sourceUrl: url,
        fetchMethod: fetched.method,
        ridersChecked: relevant.length,
        ridersMatched: matched,
        ridersNotFound: missing
      });
      citations.push({ title: `Official Wyldata WSR · ${cat.label}`, url });
    }

    const latest = await getGithubJson(JOB_PATH);
    const totalMatched = diagnostics.reduce((sum, item) => sum + item.ridersMatched, 0);
    const totalChecked = diagnostics.reduce((sum, item) => sum + item.ridersChecked, 0);
    const message = totalMatched
      ? `Official WSR check complete. Matched ${totalMatched}/${totalChecked} dashboard riders; ${proposals.length} update candidate(s) found.`
      : `Official WSR tables were reached, but 0/${totalChecked} dashboard riders matched. Do not approve anything; inspect diagnostics.`;

    await writeJob({
      jobId,
      status: "completed",
      startedAt: latest.data.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      message,
      category: "rankings",
      summary: message,
      officialSource: WSR_BASE,
      proposals,
      citations,
      diagnostics
    }, latest.sha);
  } catch (error) {
    console.error(error);
    if (jobId) {
      try {
        const latest = await getGithubJson(JOB_PATH).catch(() => null);
        await writeJob({
          jobId,
          status: "error",
          startedAt: latest?.data?.startedAt || new Date().toISOString(),
          completedAt: new Date().toISOString(),
          message: error.message || "WSR direct research failed.",
          proposals: [],
          citations: []
        }, latest?.sha);
      } catch (writeError) {
        console.error("Could not write background error status", writeError);
      }
    }
  }
}
