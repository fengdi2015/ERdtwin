const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 5174);
const root = __dirname;

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
    const prompt = `Create a concise, medically cautious social-media content plan for a rheumatology clinic. Topic: ${topic}. Campaign note/source: ${note}. Platforms: ${platforms}. Do not diagnose, promise outcomes, recommend treatment, use patient data, or state one lab cutoff is universal. Say educational content needs clinician review. Return valid JSON only with title, hook, core, slides (exactly 5 strings), source, caption, and video_beats (exactly 3 strings).`;
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-5', input: prompt })
    });
    const body = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(body.error?.message || 'OpenAI request failed');
    const text = body.output_text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The model did not return a JSON content plan.');
    send(response, 200, JSON.stringify(JSON.parse(match[0])), 'application/json; charset=utf-8');
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
