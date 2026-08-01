// scripts/fetch-data.mjs
// GitHub Actionsが毎日これを実行し、data.json を更新します。
// 手作業での実行は不要です。ローカルでテストしたい場合のみ:
//   ANTHROPIC_API_KEY=sk-... node scripts/fetch-data.mjs
//
// このスクリプトが更新できるのは「data.json」だけです。
// index.html 内の選手プロフィール(生年月日・スポンサー等)は
// 引き続き index.html を直接編集してください。

import { writeFile, readFile } from "node:fs/promises";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY が設定されていません。GitHub Secrets を確認してください。");
  process.exit(1);
}

// index.html から「ランキング追跡中の選手名」と「ロースター全員の名前」を
// 正規表現で抜き出す(index.htmlを唯一の情報源にするため、二重管理を避ける)
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const riderMatches = [...html.matchAll(/R\("([a-z]+)","([^"]+)"/g)];
const ALL_RIDERS = riderMatches.map(([, id, name]) => ({ id, name }));
const trackedMatches = [...html.matchAll(/R\("([a-z]+)","([^"]+)"[^)]*?rank:(\d+)/gs)];
const TRACKED = trackedMatches.map(([, id, name]) => ({ id, name }));

console.log(`Roster: ${ALL_RIDERS.length} riders, ${TRACKED.length} tracked on OWSR.`);

async function askClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0) throw new Error("応答にJSONが見つかりません: " + text.slice(0, 200));
  return JSON.parse(clean.slice(start, end + 1));
}

const today = new Date().toISOString().slice(0, 10);
const out = { updatedAt: today, live: null, calendar: [], riders: {}, foundVideoIds: {} };

// 既存の data.json があれば土台として引き継ぐ(前回分の残す)
try {
  const prev = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));
  Object.assign(out, { calendar: prev.calendar || [], riders: prev.riders || {}, foundVideoIds: prev.foundVideoIds || {} });
} catch {
  console.log("既存の data.json なし。新規作成します。");
}

// 1) イベントレーダー + 大会カレンダー
try {
  const names = ALL_RIDERS.map((r) => r.name).join("; ");
  const ev = await askClaude(
    `Today is ${today}. Search the web for professional skateboarding contests (World Skate street/park events, ` +
      `Olympic qualifiers, SLS, X Games, Tampa, national championships, JSF Japan events) happening today/this week, ` +
      `and confirmed upcoming ones over the next 3 months.\n` +
      `Roster to check for entries: ${names}.\n` +
      `Respond with STRICT JSON ONLY, no prose, no fences:\n` +
      `{"live": null OR {"name":"","location":"","dates":"","riderNames":[],"link":""},\n` +
      ` "upcoming":[{"name":"","date":"YYYY-MM-DD","city":"","country":"","type":"","qual":true|false,"riderNames":[]}]}\n` +
      `riderNames must match my roster list exactly. Max 8 upcoming. Do not invent events.`
  );
  const nameToId = (n) => ALL_RIDERS.find((r) => r.name.toLowerCase() === String(n).toLowerCase())?.id;
  if (ev.live) out.live = { ...ev.live, riders: (ev.live.riderNames || []).map(nameToId).filter(Boolean) };
  if (Array.isArray(ev.upcoming) && ev.upcoming.length) {
    out.calendar = ev.upcoming.map((e) => ({
      name: e.name, date: e.date, city: e.city || "TBC", country: e.country || "TBC",
      type: e.type || "Contest", qual: !!e.qual, riders: (e.riderNames || []).map(nameToId).filter(Boolean),
    }));
  }
  console.log(`Event radar OK — live: ${out.live ? out.live.name : "none"}, upcoming: ${out.calendar.length}`);
} catch (e) {
  console.warn("Event radar failed:", e.message);
}

// 2) OWSRランキング追跡中の選手(rank付き)を1人ずつ確認
for (const r of TRACKED) {
  try {
    const j = await askClaude(
      `Search the web for the current Olympic World Skateboarding Ranking (OWSR / World Skate ranking) of ` +
        `skateboarder "${r.name}", plus their most recent contest result.\n` +
        `Respond with STRICT JSON ONLY, no prose, no fences:\n` +
        `{"rank": number or null, "points": number or null, ` +
        `"recentResult": null OR {"event":"","date":"YYYY-MM-DD","location":"","placement": number}}\n` +
        `Use null for anything unverifiable. Do not guess.`
    );
    const prevR = out.riders[r.id] || {};
    out.riders[r.id] = {
      owsrRank: typeof j.rank === "number" ? j.rank : prevR.owsrRank ?? null,
      points: j.points ?? prevR.points ?? null,
      change: typeof j.rank === "number" && prevR.owsrRank ? prevR.owsrRank - j.rank : prevR.change ?? 0,
      rankPlaceholder: typeof j.rank === "number" ? false : prevR.rankPlaceholder ?? true,
      recentResult: j.recentResult || null,
      updatedAt: today,
    };
    console.log(`Rank OK — ${r.name}: #${j.rank ?? "?"}`);
  } catch (e) {
    console.warn(`Rank fetch failed for ${r.name}:`, e.message);
  }
  await new Promise((res) => setTimeout(res, 300)); // レート制限への配慮
}

// 3) 写真の無い選手の本人クリップを探す(自動ポートレート用)
try {
  const noPic = ALL_RIDERS.filter((r) => !out.foundVideoIds[r.id]).slice(0, 6); // コスト抑制のため6人ずつ
  if (noPic.length) {
    const j = await askClaude(
      `Search the web for official YouTube clips (shorts or parts) from ASICS Skateboarding, Thrasher Magazine, ` +
        `or Free Skate Mag featuring these individual skateboarders: ${noPic.map((r) => `"${r.name}"`).join(", ")}.\n` +
        `Respond with STRICT JSON ONLY, no prose, no fences:\n` +
        `{"found":[{"riderName":"","youtubeId":""}]}\n` +
        `Only include entries with a real 11-character YouTube ID you actually located. riderName must match exactly. ` +
        `Max one clip per rider. Do not guess IDs.`
    );
    (j.found || []).forEach((f) => {
      const r = ALL_RIDERS.find((x) => x.name.toLowerCase() === String(f.riderName).toLowerCase());
      if (r && f.youtubeId && /^[\w-]{11}$/.test(f.youtubeId)) out.foundVideoIds[r.id] = f.youtubeId;
    });
    console.log(`Clip hunt OK — found ${(j.found || []).length} new clips`);
  }
} catch (e) {
  console.warn("Clip hunt failed:", e.message);
}

await writeFile(new URL("../data.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("data.json 更新完了:", today);
