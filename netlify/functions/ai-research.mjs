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
      return `Find only verifiable current World Skate / Olympic skateboarding ranking updates for the listed riders. Prefer official World Skate sources. Propose action update_rider_ranking. patch must be {"riderId":"existing-id","owsrRank":number|null,"points":number|null,"updatedAt":"YYYY-MM-DD"}. Do not guess.`;
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
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      tools: [{ type: "web_search" }],
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
