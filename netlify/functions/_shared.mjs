import crypto from "node:crypto";

const OWNER = process.env.GITHUB_OWNER || "rterra0730-png";
const REPO = process.env.GITHUB_REPO || "Asics-Skateboarding-Team";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const GH_API = "https://api.github.com";

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export function requirePost(event) {
  if (event.httpMethod !== "POST") {
    const err = new Error("POST only");
    err.statusCode = 405;
    throw err;
  }
}

export function requireAdminKey(event) {
  const expected = process.env.ADMIN_SYNC_KEY || "";
  const supplied = event.headers["x-admin-key"] || event.headers["X-Admin-Key"] || "";
  if (!expected || !supplied) {
    const err = new Error("Admin key is not configured or missing.");
    err.statusCode = 401;
    throw err;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error("Invalid admin key.");
    err.statusCode = 401;
    throw err;
  }
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured in Netlify.");
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "asics-skateboarding-ai-admin"
  };
}

export async function getGithubJson(path) {
  const url = `${GH_API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(url, { headers: githubHeaders() });
  const payload = await res.json();
  if (!res.ok) throw new Error(`GitHub read failed for ${path}: ${payload.message || res.status}`);
  const content = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { data: JSON.parse(content), sha: payload.sha };
}

export async function putGithubJson(path, data, sha, message) {
  const url = `${GH_API}/repos/${OWNER}/${REPO}/contents/${path}`;
  const content = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...githubHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ message, content, sha, branch: BRANCH })
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(`GitHub write failed for ${path}: ${payload.message || res.status}`);
  return payload;
}

export function compactRiders(ridersData) {
  return (ridersData.riders || [])
    .filter(r => r.visible !== false)
    .map(r => ({
      id: r.id,
      name: r.name,
      country: r.country,
      discipline: r.discipline,
      gender: r.gender,
      ranking: r.ranking || {},
      recentResults: (r.results || []).slice(0, 4)
    }));
}

export function extractCitations(response) {
  const seen = new Set();
  const out = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      for (const ann of content.annotations || []) {
        if (ann.type !== "url_citation" || !ann.url || seen.has(ann.url)) continue;
        seen.add(ann.url);
        out.push({ title: ann.title || ann.url, url: ann.url });
      }
    }
  }
  return out;
}

export function safeId(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now()}`;
}
