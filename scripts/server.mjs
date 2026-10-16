import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planBuildingWithModel, validateStructurePlan } from '../packages/ai-planner/dist/index.js';

const root = resolve(process.env.CRAFTAIB_PUBLIC_DIR || 'dist');
const maxBodyBytes = 8 * 1024 * 1024;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.wasm': 'application/wasm' };

try {
  const envFile = await readFile(resolve('.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error(`Unable to read server environment file: ${error.message}`);
}

function serviceConfig(withImage) {
  const prefix = withImage ? 'CRAFTAIB_VISION' : 'CRAFTAIB_TEXT';
  const endpoint = (process.env.CRAFTAIB_MODEL_API_URL || process.env[`${prefix}_API_URL`] || (withImage ? process.env.CRAFTAIB_TEXT_API_URL : ''))?.trim();
  const apiKey = (process.env.CRAFTAIB_MODEL_API_KEY || process.env[`${prefix}_API_KEY`] || (withImage ? process.env.CRAFTAIB_TEXT_API_KEY : ''))?.trim();
  const model = (process.env.CRAFTAIB_MODEL || process.env[`${prefix}_MODEL`] || (withImage ? process.env.CRAFTAIB_TEXT_MODEL : ''))?.trim();
  const timeoutMs = Number(process.env.CRAFTAIB_MODEL_TIMEOUT_MS || process.env[`${prefix}_TIMEOUT_MS`] || (withImage ? process.env.CRAFTAIB_TEXT_TIMEOUT_MS : ''));
  const retries = Number(process.env.CRAFTAIB_MODEL_MAX_RETRIES || process.env[`${prefix}_MAX_RETRIES`] || (withImage ? process.env.CRAFTAIB_TEXT_MAX_RETRIES : ''));
  return endpoint && model ? { endpoint, apiKey, model,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(120000, Math.floor(timeoutMs))) : 30000,
    retries: Number.isFinite(retries) ? Math.max(0, Math.min(5, Math.floor(retries))) : 1,
  } : null;
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function configAdminAuthorized(request) {
  const required = process.env.CRAFTAIB_ADMIN_TOKEN?.trim();
  if (!required) return true;
  const supplied = (request.headers.authorization || '').startsWith('Bearer ')
    ? request.headers.authorization.slice(7).trim()
    : '';
  const expected = Buffer.from(required);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validEndpoint(value) {
  if (!value) return '';
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Model endpoint must use HTTP or HTTPS.');
  return parsed.toString().replace(/\/$/, '');
}

async function saveModelConfig(input) {
  const envPath = resolve('.env');
  let content = '';
  try { content = await readFile(envPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const values = {};
  const shared = input?.generation ?? input?.text ?? {};
  values.CRAFTAIB_MODEL_API_URL = validEndpoint(String(shared.endpoint ?? '').trim());
  values.CRAFTAIB_MODEL = String(shared.model ?? '').trim().slice(0, 160);
  if (shared.apiKey) values.CRAFTAIB_MODEL_API_KEY = String(shared.apiKey).trim();
  values.CRAFTAIB_MODEL_TIMEOUT_MS = String(Math.max(1000, Math.min(120000, Number(shared.timeoutMs) || 30000)));
  values.CRAFTAIB_MODEL_MAX_RETRIES = String(Math.max(0, Math.min(5, Number(shared.retries) || 0)));
  const vision = input?.vision ?? {};
  if (vision.endpoint || vision.model || vision.apiKey) {
    values.CRAFTAIB_VISION_API_URL = validEndpoint(String(vision.endpoint ?? '').trim());
    values.CRAFTAIB_VISION_MODEL = String(vision.model ?? '').trim().slice(0, 160);
    if (vision.apiKey) values.CRAFTAIB_VISION_API_KEY = String(vision.apiKey).trim();
  }
  const lines = content.split(/\r?\n/).filter((line) => !Object.prototype.hasOwnProperty.call(values, /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line)?.[1] ?? ''));
  for (const [key, value] of Object.entries(values)) lines.push(`${key}=${String(value).replace(/[\r\n]/g, '')}`);
  await writeFile(envPath, `${lines.filter(Boolean).join('\n')}\n`, 'utf8');
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('Request is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }); }
}

async function serveStatic(pathname, response) {
  let relative;
  try { relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^[/\\]+/, ''); }
  catch { return false; }
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    response.writeHead(200, { 'content-type': mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
    return true;
  } catch { return false; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/ai/status') {
    const text = serviceConfig(false);
    const vision = serviceConfig(true);
    sendJson(response, 200, { ok: true, text: Boolean(text), vision: Boolean(vision), generationEndpoint: text?.endpoint ?? null, generationModel: text?.model ?? null, textEndpoint: text?.endpoint ?? null, visionEndpoint: vision?.endpoint ?? null, textModel: text?.model ?? null, visionModel: vision?.model ?? null, textTimeoutMs: text?.timeoutMs ?? null, visionTimeoutMs: vision?.timeoutMs ?? null, textRetries: text?.retries ?? null, visionRetries: vision?.retries ?? null });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/ai/config') {
    if (!configAdminAuthorized(request)) return sendJson(response, 401, { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Administrator authorization is required.' } });
    try {
      await saveModelConfig(await readJson(request));
      const text = serviceConfig(false);
      const vision = serviceConfig(true);
      sendJson(response, 200, { ok: true, text: Boolean(text), vision: Boolean(vision), textModel: text?.model ?? null, visionModel: vision?.model ?? null });
    } catch (error) {
      sendJson(response, Number(error?.statusCode) || 400, { ok: false, error: { code: 'CONFIG_INVALID', message: error instanceof Error ? error.message : 'Model configuration is invalid.' } });
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/ai/structure-plan') {
    try {
      const input = await readJson(request);
      const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
      const image = input?.referenceImage;
      if (image && typeof image.dataUrl !== 'string') return sendJson(response, 400, { ok: false, error: { code: 'INVALID_IMAGE', message: 'Reference image data is invalid.' } });
      const hasImage = typeof image?.dataUrl === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(image.dataUrl);
      if (image && !hasImage) return sendJson(response, 400, { ok: false, error: { code: 'INVALID_IMAGE', message: 'Use a PNG, JPEG, WebP, or GIF reference image.' } });
      if ((!prompt && !hasImage) || prompt.length > 6000) return sendJson(response, 400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Add a building description or a supported reference image. Descriptions must be 6,000 characters or less.' } });
      if (hasImage && image.dataUrl.length > 7_000_000) return sendJson(response, 413, { ok: false, error: { code: 'IMAGE_TOO_LARGE', message: 'Reference image is too large. Use an image smaller than 5 MB.' } });
      const config = serviceConfig(hasImage);
      if (!config) return sendJson(response, 503, { ok: false, error: { code: 'MODEL_NOT_CONFIGURED', message: hasImage ? 'Vision model service is not configured.' : 'Text model service is not configured.' } });
      const constraints = input.constraints && typeof input.constraints === 'object' ? input.constraints : {};
      const type = typeof constraints.type === 'string' ? constraints.type.slice(0, 40) : '';
      const style = typeof constraints.style === 'string' ? constraints.style.slice(0, 40) : '';
      const floors = Number.isInteger(constraints.floors) ? Math.max(1, Math.min(12, constraints.floors)) : null;
      const width = Number.isInteger(constraints.width) ? Math.max(8, Math.min(128, constraints.width)) : null;
      const length = Number.isInteger(constraints.length) ? Math.max(8, Math.min(128, constraints.length)) : null;
      const constraintText = [style, type, floors && `${floors} floors`, width && length && `${width} x ${length} blocks`].filter(Boolean).join(', ');
      const fetcher = (endpoint, init) => fetch(endpoint, { ...init, signal: AbortSignal.timeout(45_000) });
      const plan = await planBuildingWithModel({ prompt: [constraintText, prompt].filter(Boolean).join('. '), seed: Number.isInteger(input.seed) ? input.seed : 42, referenceImage: hasImage ? { dataUrl: image.dataUrl } : undefined }, { ...config, fetcher, maxRetries: config.retries, requestTimeoutMs: config.timeoutMs });
      validateStructurePlan(plan);
      return sendJson(response, 200, { ok: true, plan });
    } catch (error) {
      const status = Number(error?.statusCode) || 502;
      const message = status === 502 ? 'The AI service could not produce a valid building plan. Check the service configuration and retry.' : error.message;
      return sendJson(response, status, { ok: false, error: { code: status === 502 ? 'MODEL_REQUEST_FAILED' : 'INVALID_REQUEST', message } });
    }
  }
  if (request.method === 'GET' && await serveStatic(url.pathname, response)) return;
  sendJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4183);
  server.listen(port, '127.0.0.1', () => console.log(`CraftAIB listening on http://127.0.0.1:${server.address().port}`));
}

export { server, serviceConfig };
