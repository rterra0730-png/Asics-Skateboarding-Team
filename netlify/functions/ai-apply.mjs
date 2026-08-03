import {
  getGithubJson,
  json,
  putGithubJson,
  requireAdminKey,
  requirePost,
  safeId
} from "./_shared.mjs";

const allowedActions = new Set(["update_rider_ranking", "add_rider_result", "add_event", "add_footage"]);

function normalizeDate(value) {
  const s = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
}

function applyProposal(files, proposal) {
  if (!allowedActions.has(proposal.action)) throw new Error(`Unsupported action: ${proposal.action}`);
  const p = proposal.patch || {};

  if (proposal.action === "update_rider_ranking") {
    const rider = files.riders.riders.find(r => r.id === p.riderId);
    if (!rider) throw new Error(`Rider not found: ${p.riderId}`);
    const previous = Number.isInteger(rider.ranking?.owsrRank) ? rider.ranking.owsrRank : null;
    const next = Number.isInteger(p.owsrRank) ? p.owsrRank : null;
    rider.ranking = {
      ...(rider.ranking || {}),
      owsrRank: next,
      points: typeof p.points === "number" ? p.points : null,
      change: previous !== null && next !== null ? previous - next : 0,
      rankPlaceholder: false,
      updatedAt: normalizeDate(p.updatedAt)
    };
    return "riders";
  }

  if (proposal.action === "add_rider_result") {
    const rider = files.riders.riders.find(r => r.id === p.riderId);
    if (!rider) throw new Error(`Rider not found: ${p.riderId}`);
    const result = p.result || {};
    if (!result.event || !result.date || !Number.isInteger(result.placement)) throw new Error("Incomplete result proposal.");
    rider.results ||= [];
    const duplicate = rider.results.some(r => r.event === result.event && r.date === result.date);
    if (!duplicate) rider.results.unshift({
      event: String(result.event),
      date: normalizeDate(result.date),
      location: String(result.location || ""),
      placement: result.placement
    });
    return "riders";
  }

  if (proposal.action === "add_event") {
    const e = p.event || {};
    if (!e.name || !e.date) throw new Error("Incomplete event proposal.");
    files.calendar.events ||= [];
    const duplicate = files.calendar.events.some(x => x.name === e.name && x.date === e.date);
    if (!duplicate) files.calendar.events.push({
      name: String(e.name),
      date: normalizeDate(e.date),
      city: String(e.city || ""),
      country: String(e.country || ""),
      type: String(e.type || "Contest"),
      qual: Boolean(e.qual),
      link: String(e.link || ""),
      riders: Array.isArray(e.riders) ? e.riders.filter(id => files.riders.riders.some(r => r.id === id)) : []
    });
    files.calendar.updatedAt = new Date().toISOString().slice(0, 10);
    return "calendar";
  }

  if (proposal.action === "add_footage") {
    const v = p.video || {};
    if (!v.title || !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(v.youtubeUrl || "")) {
      throw new Error("Footage proposal needs a valid YouTube URL.");
    }
    files.footage.videos ||= [];
    const duplicate = files.footage.videos.some(x => x.youtubeUrl === v.youtubeUrl || x.id === v.id);
    if (!duplicate) files.footage.videos.unshift({
      visible: true,
      id: safeId(v.id || v.title),
      title: String(v.title),
      sourceType: "youtube",
      youtubeUrl: String(v.youtubeUrl),
      videoFile: "",
      thumbnail: String(v.thumbnail || ""),
      year: Number.isInteger(v.year) ? v.year : new Date().getFullYear(),
      type: String(v.type || "Footage"),
      category: ["TEAM", "SOLO", "EDIT"].includes(v.category) ? v.category : "EDIT",
      description: String(v.description || ""),
      riderIds: Array.isArray(v.riderIds) ? v.riderIds.filter(id => files.riders.riders.some(r => r.id === id)) : []
    });
    return "footage";
  }
}

export async function handler(event) {
  try {
    requirePost(event);
    requireAdminKey(event);
    const { proposals } = JSON.parse(event.body || "{}");
    if (!Array.isArray(proposals) || proposals.length === 0) return json(400, { error: "No proposals selected." });
    if (proposals.length > 50) return json(400, { error: "Too many proposals in one request." });

    const [ridersFile, calendarFile, footageFile] = await Promise.all([
      getGithubJson("content/riders.json"),
      getGithubJson("content/calendar.json"),
      getGithubJson("content/footage.json")
    ]);
    const files = { riders: ridersFile.data, calendar: calendarFile.data, footage: footageFile.data };
    const changed = new Set();
    for (const proposal of proposals) changed.add(applyProposal(files, proposal));

    const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const commits = [];
    if (changed.has("riders")) commits.push(await putGithubJson(
      "content/riders.json", files.riders, ridersFile.sha, `AI admin: update rider data (${stamp})`
    ));
    if (changed.has("calendar")) commits.push(await putGithubJson(
      "content/calendar.json", files.calendar, calendarFile.sha, `AI admin: update calendar (${stamp})`
    ));
    if (changed.has("footage")) commits.push(await putGithubJson(
      "content/footage.json", files.footage, footageFile.sha, `AI admin: update footage (${stamp})`
    ));

    return json(200, {
      ok: true,
      applied: proposals.length,
      files: [...changed],
      commits: commits.map(c => c.commit?.html_url).filter(Boolean)
    });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: error.message || "Apply failed." });
  }
}
