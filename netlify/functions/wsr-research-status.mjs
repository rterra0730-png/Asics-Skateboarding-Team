import { getGithubJson, json, requireAdminKey, requirePost } from "./_shared.mjs";

const JOB_PATH = "content/ai-jobs/wsr-latest.json";

export async function handler(event) {
  try {
    requirePost(event);
    requireAdminKey(event);
    const { jobId } = JSON.parse(event.body || "{}");
    if (!jobId) return json(400, { error: "Missing jobId." });
    try {
      const { data } = await getGithubJson(JOB_PATH);
      if (data.jobId !== jobId) {
        return json(200, { jobId, status: "queued", message: "Waiting for the background job to start..." });
      }
      return json(200, data);
    } catch (error) {
      if (/GitHub read failed/.test(error.message || "")) {
        return json(200, { jobId, status: "queued", message: "Waiting for the background job to start..." });
      }
      throw error;
    }
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: error.message || "Status check failed." });
  }
}
