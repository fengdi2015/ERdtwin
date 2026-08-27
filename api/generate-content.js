const safeTopics = new Set(["b12", "fatigue", "stiffness", "infusion", "custom"]);

function extractJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The model did not return a JSON content plan.");
  return JSON.parse(match[0]);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI generation is not connected. Add OPENAI_API_KEY in the Vercel project environment variables." });
  const { topic = "custom", note = "", platforms = [] } = req.body || {};
  const selectedTopic = safeTopics.has(topic) ? topic : "custom";
  const prompt = `Create a rheumatology clinic social-media education content plan. Topic: ${selectedTopic}. Creator note: ${String(note).slice(0, 1500)}. Platforms: ${platforms.join(", ")}.
Return ONLY valid JSON with title, hook, core, slides (exactly 5 short strings), source, caption, and video_beats (exactly 3 short strings).
Clinical safety rules: education only; no individual diagnosis, treatment recommendation, supplement recommendation, cure claim, outcome guarantee, or patient story. State uncertainty when needed. Use plain language. If source support is inadequate, say clinician review required.`;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-5", input: prompt, temperature: 0.2 })
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const body = await response.json();
    const plan = extractJson(body.output_text);
    if (!Array.isArray(plan.slides) || plan.slides.length !== 5 || !Array.isArray(plan.video_beats) || plan.video_beats.length !== 3) throw new Error("The model returned an incomplete content plan.");
    return res.status(200).json(plan);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to generate the content plan." });
  }
};
