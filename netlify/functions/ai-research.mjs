import OpenAI from "openai";
import {
  compactRiders,
  extractCitations,
  getGithubJson,
  json,
  requireAdminKey,
  requirePost
} from "./_shared.mjs";

const allowedCategories = new Set(["rankings", "results", "events", "footage"]);
const WSR_PAGE = "https://www.worldskate.org/skateboarding/ranking-wsr.html";
const WSR_EMBED = "https://wyldata.com/iframes/wsr";
const OFFICIAL_WSR_DOMAINS = ["worldskate.org", "wyldata.com"];

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: ["rankings", "results", "events", "footage"] },
    summary: { type: "string" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          action: {
            type: "string",
            enum: ["update_rider_ranking", "add_rider_result", "add_event", "add_footage"]
          },
          entityId: { type: "string" },
          title: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          sourceTitle: { type: "string" },
          sourceUrl: { type: "string" },
          patch: {
            type: "object",
            additionalProperties: true
          }
        },
        required: ["id", "action", "entityId", "title", "reason", "confidence", "sourceTitle", "sourceUrl", "patch"]
      }
    }
  },
  required: ["category", "summary", "proposals"]
};

function categoryInstruction(category) {
  switch (category) {
    case "rankings":
      return `Use the official World Skateboarding Ranking (WSR) only. Primary page: ${WSR_PAGE}. The live ranking table is embedded from ${WSR_EMBED}. Propose action update_rider_ranking. patch must be {"riderId":"existing-id","owsrRank":number|null,"points":number|null,"updatedAt":"YYYY-MM-DD"}. Do not use unofficial rankings, old PDF snapshots, social posts, predictions, or Olympic articles as the ranking value. Do not guess.`;
    case "results":
      return `Find recent completed contest results for the listed riders that are not already in recentResults. Prefer official event, World Skate, SLS, X Games, or organizer sources. Propose action add_rider_result. patch must be {"riderId":"existing-id","result":{"event":"","date":"YYYY-MM-DD","location":"","placement":number}}. Do not add appearances without a verified placement.`;
    case "events":
      return `Find upcoming major skateboarding events relevant to these riders for the next 12 months. Prefer official organizers. Propose action add_event. patch must be {"event":{"name":"","date":"YYYY-MM-DD","city":"","country":"","type":"","qual":boolean,"link":"","riders":["existing-rider-id"]}}. Only link riders when entry is verified; otherwise use an empty riders array.`;
    case "footage":
      return `Find newly published public YouTube skate footage featuring the listed riders or ASICS Skateboarding. Prefer official ASICS, brand, rider, filmer, or established skate-media channels. Propose action add_footage. patch must be {"video":{"id":"lowercase-hyphen-id","title":"","sourceType":"youtube","youtubeUrl":"","videoFile":"","thumbnail":"","year":number,"type":"","category":"TEAM|SOLO|EDIT","description":"","riderIds":["existing-rider-id"],"visible":true}}. Do not suggest duplicate or unavailable links.`;
    default:
      throw new Error("Unsupported category");
  }
}


function rankingGroup(rider) {
  const discipline = String(rider.discipline || "").toUpperCase();
  const gender = String(rider.gender || "").toUpperCase();
  if (!['STREET', 'PARK'].includes(discipline) || !['M', 'W'].includes(gender)) return null;
  return `${gender}-${discipline}`;
}

function groupLabel(key) {
  const [gender, discipline] = key.split('-');
  return `${gender === 'W' ? 'WOMEN' : 'MEN'} ${discipline}`;
}

function isOfficialWsrUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'worldskate.org' || host.endsWith('.worldskate.org') || host === 'wyldata.com' || host.endsWith('.wyldata.com');
  } catch {
    return false;
  }
}

function dedupeProposals(proposals) {
  const order = { high: 3, medium: 2, low: 1 };
  const map = new Map();
  for (const proposal of proposals) {
    const key = `${proposal.action}:${proposal.entityId}`;
    const prev = map.get(key);
    if (!prev || (order[proposal.confidence] || 0) > (order[prev.confidence] || 0)) map.set(key, proposal);
  }
  return [...map.values()];
}

async function researchOfficialWsr(client, current) {
  const groups = new Map();
  for (const rider of current.riders) {
    const key = rankingGroup(rider);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rider);
  }

  const allProposals = [];
  const allCitations = [];
  const summaries = [];

  for (const [key, riders] of groups) {
    const label = groupLabel(key);
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.1",
      tools: [{
        type: "web_search",
        filters: { allowed_domains: OFFICIAL_WSR_DOMAINS },
        external_web_access: true
      }],
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: `You are verifying current official World Skateboarding Ranking data for an internal ASICS dashboard. Use only World Skate and Wyldata. The source of truth is the current WSR leaderboard at ${WSR_PAGE}, embedded from ${WSR_EMBED}. The leaderboard has separate Male/Female and Street/Park filters. Never mix categories. Never use an old PDF, news article, social post, prediction, or another ranking provider as the current ranking. If the live official value cannot be verified, return no proposal for that athlete.`
        },
        {
          role: "user",
          content: `Check the current ${label} World Skateboarding Ranking for ONLY the riders listed below. On the official table, the first numeric column is rank and PTS is the total points. Match exact full names. Athlete detail pages on wyldata.com may be used only when they clearly show the current rank for the same discipline and gender. Compare with CURRENT DATA and propose an update only when the official rank or points differ, or rankPlaceholder is true. The sourceUrl for every proposal must be an official World Skate or Wyldata URL. updatedAt must be ${current.today}.

CURRENT RIDERS (${label}):
${JSON.stringify(riders)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "official_wsr_update_proposals",
          strict: false,
          schema: proposalSchema
        }
      }
    });

    const parsed = JSON.parse(response.output_text || "{}");
    summaries.push(parsed.summary || `${label}: checked`);
    for (const proposal of parsed.proposals || []) {
      if (proposal.action !== 'update_rider_ranking') continue;
      if (!riders.some(r => r.id === proposal.entityId || r.id === proposal.patch?.riderId)) continue;
      if (!isOfficialWsrUrl(proposal.sourceUrl)) continue;
      if (!Number.isInteger(proposal.patch?.owsrRank) || proposal.patch.owsrRank < 1) continue;
      proposal.entityId = proposal.patch.riderId;
      proposal.patch.updatedAt = current.today;
      allProposals.push(proposal);
    }
    allCitations.push(...extractCitations(response));
  }

  return {
    category: 'rankings',
    summary: summaries.join(' | '),
    proposals: dedupeProposals(allProposals),
    citations: [...new Map(allCitations.map(x => [x.url, x])).values()]
  };
}

export async function handler(event) {
  try {
    requirePost(event);
    requireAdminKey(event);
    const { category } = JSON.parse(event.body || "{}");
    if (!allowedCategories.has(category)) return json(400, { error: "Invalid category." });
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured in Netlify.");

    const [{ data: riders }, { data: calendar }, { data: footage }] = await Promise.all([
      getGithubJson("content/riders.json"),
      getGithubJson("content/calendar.json"),
      getGithubJson("content/footage.json")
    ]);

    const current = {
      today: new Date().toISOString().slice(0, 10),
      riders: compactRiders(riders),
      currentEvents: (calendar.events || []).slice(0, 40),
      currentFootage: (footage.videos || []).map(v => ({ id: v.id, title: v.title, youtubeUrl: v.youtubeUrl, riderIds: v.riderIds }))
    };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (category === "rankings") {
      const result = await researchOfficialWsr(client, current);
      return json(200, {
        ...result,
        generatedAt: new Date().toISOString(),
        officialSource: WSR_PAGE
      });
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.1",
      tools: [{ type: "web_search", external_web_access: true }],
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: `You are a cautious data researcher for an internal ASICS Skateboarding team dashboard. Search the live web. Every proposal must be supported by a source URL you actually found. Never invent rankings, placements, dates, participants, video links, or rider IDs. Return no proposal when evidence is weak, conflicting, old, or already represented in the current data. Keep titles concise and English-language data compatible with the existing JSON.`
        },
        {
          role: "user",
          content: `${categoryInstruction(category)}\n\nCURRENT DATA:\n${JSON.stringify(current)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "dashboard_update_proposals",
          strict: false,
          schema: proposalSchema
        }
      }
    });

    const parsed = JSON.parse(response.output_text || "{}");
    return json(200, {
      ...parsed,
      generatedAt: new Date().toISOString(),
      citations: extractCitations(response)
    });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: error.message || "Research failed." });
  }
}
