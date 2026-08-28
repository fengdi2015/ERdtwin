const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 5174);
const root = __dirname;
const localKeyFile = process.env.CV_MACHINE_ENV_FILE || 'C:\\Users\\difen\\CV_machine\\.env';
const contentModel = process.env.CONTENT_MODEL || 'gpt-5-mini';

// The key remains in the separate CV-machine environment file; it is never written
// into this project, sent to the browser, or logged.
function loadCvMachineKey() {
  if (process.env.OPENAI_API_KEY || !fs.existsSync(localKeyFile)) return;
  const entry = fs.readFileSync(localKeyFile, 'utf8')
    .split(/\r?\n/)
    .find((line) => /^\s*OPENAI_API_KEY\s*=/.test(line));
  if (!entry) return;
  let value = entry.replace(/^\s*OPENAI_API_KEY\s*=\s*/, '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (value) process.env.OPENAI_API_KEY = value;
}

loadCvMachineKey();

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy();
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function generateContent(request, response) {
  if (!process.env.OPENAI_API_KEY) {
    return send(response, 503, JSON.stringify({ error: 'OPENAI_API_KEY is not set on this computer. Set it in the terminal before starting the local server.' }), 'application/json; charset=utf-8');
  }
  try {
    const payload = JSON.parse(await readBody(request));
    const topic = String(payload.topic || 'rheumatology education');
    const note = String(payload.note || 'Educational content; clinician review required.');
    const platforms = Array.isArray(payload.platforms) ? payload.platforms.join(', ') : '';
    const design = ['calm', 'bold', 'minimal'].includes(payload.design) ? payload.design : 'calm';
    const variationCount = payload.variationCount === 3 ? 3 : 1;
    const designGuide = { calm: 'calm clinical: teal, cream, reassuring and approachable', bold: 'bold education: navy, coral, energetic but still professional', minimal: 'minimal expert: white, graphite, editorial and restrained' }[design];
    const shape = variationCount === 3
      ? 'Return valid JSON only as {"variations":[...]} with exactly 3 clearly different options. Each option must contain title, hook, core, slides (exactly 5 strings), source, caption, video_beats (exactly 3 strings), and design_note.'
      : 'Return valid JSON only with title, hook, core, slides (exactly 5 strings), source, caption, video_beats (exactly 3 strings), and design_note.';
    const prompt = `Create a concise, medically cautious social-media content plan for a rheumatology clinic. Topic: ${topic}. Campaign note/source: ${note}. Platforms: ${platforms}. The fixed, accessible carousel template is ${designGuide}. Suggest a short design_note that guides emphasis or imagery direction for this template; do not change its color system or layout. Do not diagnose, promise outcomes, recommend treatment, use patient data, or state one lab cutoff is universal. Say educational content needs clinician review. ${shape}`;
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: contentModel, input: prompt, reasoning: { effort: 'low' }, max_output_tokens: variationCount === 3 ? 3000 : 1800, text: { format: { type: 'json_object' } } })
    });
    const body = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(body.error?.message || 'OpenAI request failed');
    const text = body.output_text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The model did not return a JSON content plan.');
    const plan = JSON.parse(match[0]);
    if (variationCount === 3 && (!Array.isArray(plan.variations) || plan.variations.length !== 3)) {
      throw new Error('The model did not return three complete variations. Please try again.');
    }
    send(response, 200, JSON.stringify(plan), 'application/json; charset=utf-8');
  } catch (error) {
    send(response, 500, JSON.stringify({ error: error.message || 'Unable to generate content.' }), 'application/json; charset=utf-8');
  }
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (request.method === 'POST' && pathname === '/api/generate-content') return generateContent(request, response);
  if (request.method === 'GET' && (pathname === '/' || pathname === '/content-studio')) {
    return send(response, 200, fs.readFileSync(path.join(root, 'content_studio_app.html')), 'text/html; charset=utf-8');
  }
  send(response, 404, 'Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Content Studio is running at http://localhost:${port}`);
});
