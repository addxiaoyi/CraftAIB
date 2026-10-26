import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderVoxelReview } from './lib/voxel-preview.mjs';
import { fitStructurePlanToEnvelope, planBuildingWithModel, structurePlanToGrid, summarizeInteriorVoxelization, validateStructurePlan } from '../packages/ai-planner/dist/index.js';

const root = resolve(process.env.CRAFTAIB_PUBLIC_DIR || 'dist');
const maxBodyBytes = 8 * 1024 * 1024;
const planRateWindowMs = 60_000;
const planRateLimit = Math.max(1, Number(process.env.CRAFTAIB_PLAN_RATE_LIMIT || 30));
const planRateBuckets = new Map();
const maxPlanningConcurrency = Math.max(1, Number(process.env.CRAFTAIB_PLAN_MAX_CONCURRENCY || 4));
let planningInFlight = 0;
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

function configuredWindowsProxy() {
  if (process.platform !== 'win32' || process.env.HTTPS_PROXY || process.env.https_proxy) return '';
  const registryKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  try {
    const enabledOutput = execFileSync('reg.exe', ['query', registryKey, '/v', 'ProxyEnable'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enabledOutput)) return '';
    const proxyOutput = execFileSync('reg.exe', ['query', registryKey, '/v', 'ProxyServer'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const rawProxy = /ProxyServer\s+REG_SZ\s+(.+)$/im.exec(proxyOutput)?.[1]?.trim();
    if (!rawProxy) return '';
    const routes = rawProxy.split(';').map((route) => route.trim());
    const httpsRoute = routes.find((route) => /^https=/i.test(route));
    const proxy = (httpsRoute ?? routes.find((route) => !/^(http|https|socks)=/i.test(route)) ?? routes.find((route) => /^http=/i.test(route)))?.replace(/^(https?|socks)=/i, '').trim();
    if (!proxy || proxy.startsWith('socks=')) return '';
    return proxy.includes('://') ? proxy : `http://${proxy}`;
  } catch {
    return '';
  }
}

const systemProxy = configuredWindowsProxy();
if (systemProxy) {
  process.env.HTTPS_PROXY = systemProxy;
  process.env.HTTP_PROXY ??= systemProxy;
}
if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  const bypassedHosts = new Set(['localhost', '127.0.0.1', '::1']);
  for (const host of `${process.env.NO_PROXY ?? ''},${process.env.no_proxy ?? ''}`.split(',')) {
    if (host.trim()) bypassedHosts.add(host.trim());
  }
  process.env.NO_PROXY = [...bypassedHosts].join(',');
  process.env.no_proxy = process.env.NO_PROXY;
  const { setGlobalProxyFromEnv } = await import('node:http');
  setGlobalProxyFromEnv();
}

function serviceConfig() {
  // Text and reference images always use the same configured building model.
  const configuredEndpoint = (process.env.CRAFTAIB_MODEL_API_URL || process.env.CRAFTAIB_TEXT_API_URL)?.trim();
  const apiKey = (process.env.CRAFTAIB_MODEL_API_KEY || process.env.CRAFTAIB_TEXT_API_KEY)?.trim();
  const model = (process.env.CRAFTAIB_MODEL || process.env.CRAFTAIB_TEXT_MODEL)?.trim();
  if (!configuredEndpoint || !model) return null;
  let endpoint;
  try { endpoint = validEndpoint(configuredEndpoint); } catch { return null; }
  const timeoutMs = Number(process.env.CRAFTAIB_MODEL_TIMEOUT_MS || process.env.CRAFTAIB_TEXT_TIMEOUT_MS);
  const retries = Number(process.env.CRAFTAIB_MODEL_MAX_RETRIES || process.env.CRAFTAIB_TEXT_MAX_RETRIES);
  return { endpoint, apiKey, model,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(300000, Math.floor(timeoutMs))) : 30000,
    retries: Number.isFinite(retries) ? Math.max(0, Math.min(5, Math.floor(retries))) : 1,
  };
}

function ensureLanternCore(plan, prompt) {
  const isLantern = /\blantern\b|\blamp\b|chandelier|\u706f\u7b3c|\u540a\u706f|\u706f\u5177/i.test(`${prompt} ${plan.type} ${plan.name}`);
  if (!isLantern) return plan;
  const chamber = plan.regions.find((region) => /chamber|interior|lantern.?body|灯笼内腔/i.test(`${region.name} ${region.role}`))
    ?? plan.regions.filter((region) => !/roof|spire|dome|battlement|apron|crown|tassel/i.test(`${region.name} ${region.role}`)).sort((a, b) => b.width * b.height * b.length - a.width * a.height * a.length)[0];
  const coreRegion = chamber && chamber.width >= 3 && chamber.height >= 3 && chamber.length >= 3
    ? chamber
    : { x: 0, y: 0, z: 0, ...plan.dimensions };
  const parts = [...(plan.geometry?.parts ?? [])];
  const hasSeaLantern = parts.some((part) => part.material === 'minecraft:sea_lantern'
    && part.x > coreRegion.x && part.x < coreRegion.x + coreRegion.width - 1
    && part.y > coreRegion.y && part.y < coreRegion.y + coreRegion.height - 1
    && part.z > coreRegion.z && part.z < coreRegion.z + coreRegion.length - 1);
  if (hasSeaLantern) return plan;
  parts.push({
    id: 'server-lantern-light-core', type: 'box',
    x: coreRegion.x + Math.floor(coreRegion.width / 2),
    y: coreRegion.y + Math.floor(coreRegion.height / 2),
    z: coreRegion.z + Math.floor(coreRegion.length / 2),
    width: 1, height: 1, length: 1, material: 'minecraft:sea_lantern',
    hollow: false, thickness: 1, facing: null, openSides: [], roofStyle: 'flat', ridgeAxis: 'x', purpose: 'lighting',
  });
  return { ...plan, geometry: { parts } };
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function allowPlanRequest(request, response) {
  const address = request.socket.remoteAddress || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const current = planRateBuckets.get(address);
  if (!current || now - current.startedAt >= planRateWindowMs) {
    for (const [key, bucket] of planRateBuckets) if (now - bucket.startedAt >= planRateWindowMs) planRateBuckets.delete(key);
    planRateBuckets.set(address, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= planRateLimit) {
    response.setHeader('retry-after', '60');
    sendJson(response, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many planning requests. Retry shortly.' } });
    return false;
  }
  current.count += 1;
  return true;
}

function readBearer(request) {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function oidcAdminAuthorized(request) {
  const issuer = process.env.CRAFTAIB_OIDC_ISSUER?.trim();
  if (!issuer) return null;
  const token = readBearer(request);
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== issuer || !Number.isFinite(payload.exp) || payload.exp <= now) return false;
    if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > now)) return false;
    const audience = process.env.CRAFTAIB_OIDC_AUDIENCE?.trim();
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience || !audiences.includes(audience)) return false;
    const jwksUrl = process.env.CRAFTAIB_OIDC_JWKS_URL?.trim();
    if (!jwksUrl || !header.kid || header.alg !== 'RS256') return false;
    const jwksResponse = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
    if (!jwksResponse.ok) return false;
    const jwks = await jwksResponse.json();
    const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return false;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) return false;
    const roleClaim = process.env.CRAFTAIB_OIDC_ADMIN_ROLE_CLAIM?.trim() || 'roles';
    const roles = Array.isArray(payload[roleClaim]) ? payload[roleClaim] : [payload[roleClaim]];
    return roles.includes(process.env.CRAFTAIB_OIDC_ADMIN_ROLE?.trim() || 'admin');
  } catch { return false; }
}

async function configAdminAuthorized(request) {
  const oidcResult = await oidcAdminAuthorized(request);
  if (oidcResult !== null) return oidcResult;
  const required = process.env.CRAFTAIB_ADMIN_TOKEN?.trim();
  if (!required) return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
  const supplied = readBearer(request);
  const expected = Buffer.from(required);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function originAllowed(request) {
  const allowed = process.env.CRAFTAIB_ALLOWED_ORIGIN?.trim();
  const expected = allowed || `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
  if (request.headers.origin) return request.headers.origin === expected;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!request.headers.referer) return true;
  try { return new URL(request.headers.referer).origin === new URL(expected).origin; } catch { return false; }
}

function validEndpoint(value) {
  if (!value) return '';
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Model endpoint must use HTTP or HTTPS.');
  if (parsed.pathname === '' || parsed.pathname === '/') parsed.pathname = '/v1/chat/completions';
  else if (/\/v\d+\/?$/i.test(parsed.pathname)) parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/chat/completions`;
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
  values.CRAFTAIB_MODEL_TIMEOUT_MS = String(Math.max(1000, Math.min(300000, Number(shared.timeoutMs) || 30000)));
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

async function readProviderErrorMessage(response) {
  let payload;
  try { payload = await response.json(); } catch { return ''; }
  const message = payload?.error?.message ?? payload?.message;
  if (typeof message !== 'string') return '';
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\b(?:sk|key|token)-[A-Za-z0-9._-]{12,}\b/gi, '[redacted]').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 400);
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
    const text = serviceConfig();
    const vision = serviceConfig();
    sendJson(response, 200, { ok: true, text: Boolean(text), vision: Boolean(vision), generationModel: text?.model ?? null, textModel: text?.model ?? null, visionModel: vision?.model ?? null, textTimeoutMs: text?.timeoutMs ?? null, visionTimeoutMs: vision?.timeoutMs ?? null, textRetries: text?.retries ?? null, visionRetries: vision?.retries ?? null });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/ai/config') {
    if (!originAllowed(request)) return sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Request origin is not allowed.' } });
    if (process.env.CRAFTAIB_OIDC_ISSUER?.trim() && !readBearer(request)) return sendJson(response, 401, { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } });
    if (!(await configAdminAuthorized(request))) return sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Administrator authorization is required.' } });
    try {
      await saveModelConfig(await readJson(request));
      const text = serviceConfig();
      const vision = serviceConfig();
      await appendFile(resolve('config-audit.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), action: 'model_config_updated', model: text?.model ?? null, timeoutMs: text?.timeoutMs ?? null, peer: request.socket.remoteAddress, auth: process.env.CRAFTAIB_OIDC_ISSUER ? 'oidc' : 'local' })}\n`, 'utf8');
      sendJson(response, 200, { ok: true, text: Boolean(text), vision: Boolean(vision), textModel: text?.model ?? null, visionModel: vision?.model ?? null });
    } catch (error) {
      sendJson(response, Number(error?.statusCode) || 400, { ok: false, error: { code: 'CONFIG_INVALID', message: error instanceof Error ? error.message : 'Model configuration is invalid.' } });
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/ai/test-connection') {
    if (!originAllowed(request)) return sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Request origin is not allowed.' } });
    if (process.env.CRAFTAIB_OIDC_ISSUER?.trim() && !readBearer(request)) return sendJson(response, 401, { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Administrator sign-in is required.' } });
    if (!(await configAdminAuthorized(request))) return sendJson(response, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Administrator authorization is required.' } });
    try {
      const input = await readJson(request);
      const draft = input?.generation;
      const config = draft ? {
        endpoint: validEndpoint(String(draft.endpoint ?? '').trim()),
        apiKey: String(draft.apiKey ?? '').trim(),
        model: String(draft.model ?? '').trim(),
        timeoutMs: Math.max(1000, Math.min(300000, Number(draft.timeoutMs) || 30000)),
        retries: 0,
      } : serviceConfig();
      if (!config?.endpoint || !config.model) return sendJson(response, 503, { ok: false, error: { code: 'MODEL_NOT_CONFIGURED', message: 'Enter an endpoint and model name before testing the connection.' } });
      const headers = { 'content-type': 'application/json' };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      const visionProbe = input?.capability === 'vision';
      const probeMessage = visionProbe
        ? [{ role: 'user', content: [{ type: 'text', text: 'Identify the image as a single word: pixel.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } }] }]
        : [{ role: 'user', content: 'Reply with OK.' }];
      const probeTool = {
        type: 'function',
        function: {
          name: 'craftaib_probe',
          description: 'Connectivity probe for CraftAIB construction tool calling.',
          parameters: { type: 'object', additionalProperties: false, properties: { ready: { type: 'boolean' } } },
        },
      };
      const probeText = visionProbe
        ? 'Call craftaib_probe with {"ready":true} to confirm tool calling, then identify this image as one word.'
        : 'Call craftaib_probe with {"ready":true} to confirm tool calling.';
      const probeMessages = visionProbe
        ? [{ role: 'user', content: [{ type: 'text', text: probeText }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } }] }]
        : [{ role: 'user', content: probeText }];
      const probeBody = { model: config.model, temperature: 0, tools: [probeTool], tool_choice: 'auto', messages: probeMessages };
      let responseFromModel = await fetch(config.endpoint, {
        method: 'POST', headers, body: JSON.stringify(probeBody), signal: AbortSignal.timeout(config.timeoutMs),
      });
      let forcedProbe = false;
      if (responseFromModel.ok) {
        const firstPayload = await responseFromModel.json();
        const firstMessage = firstPayload?.choices?.[0]?.message;
        const firstCalls = Array.isArray(firstMessage?.tool_calls) ? firstMessage.tool_calls : [];
        if (firstCalls.some((call) => call?.function?.name === 'craftaib_probe')) {
          return sendJson(response, 200, { ok: true, capability: visionProbe ? 'vision' : 'text', model: config.model, supportsToolCalls: true, probeMode: 'auto', message: 'Connection and tool-calling test successful.' });
        }
        forcedProbe = true;
        responseFromModel = await fetch(config.endpoint, {
          method: 'POST', headers,
          body: JSON.stringify({ ...probeBody, tool_choice: { type: 'function', function: { name: 'craftaib_probe' } } }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      }
      if (!responseFromModel.ok) {
        const providerMessage = await readProviderErrorMessage(responseFromModel);
        const credentialsRejected = [401, 403].includes(responseFromModel.status) || /no valid credentials|invalid (?:api )?key|unauthori[sz]ed|authentication failed/i.test(providerMessage);
        if (credentialsRejected) return sendJson(response, 422, { ok: false, error: { code: 'MODEL_AUTH_FAILED', message: 'The provider rejected the configured API key or account permissions. Replace the key in Settings and retry.' } });
        if (responseFromModel.status === 404) return sendJson(response, 422, { ok: false, error: { code: 'MODEL_ENDPOINT_NOT_FOUND', message: 'The model endpoint returned HTTP 404. Check that the URL includes the provider API route, commonly /v1/chat/completions.' } });
        if (responseFromModel.status === 429) return sendJson(response, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'The provider rate-limited the connection test. Retry shortly.' } });
        return sendJson(response, 502, { ok: false, error: { code: 'MODEL_REQUEST_FAILED', message: providerMessage ? `The provider rejected the test request (HTTP ${responseFromModel.status}): ${providerMessage}` : `The provider rejected the test request (HTTP ${responseFromModel.status}). Check the model name and endpoint compatibility.` } });
      }
      const payload = await responseFromModel.json();
      if (!payload?.choices?.[0]?.message) return sendJson(response, 502, { ok: false, error: { code: 'INVALID_MODEL_RESPONSE', message: 'The endpoint responded, but did not return an OpenAI-compatible chat completion.' } });
      const message = payload.choices[0].message;
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const supportsToolCalls = toolCalls.some((call) => call?.function?.name === 'craftaib_probe');
      return sendJson(response, 200, { ok: true, capability: visionProbe ? 'vision' : 'text', model: config.model, supportsToolCalls, probeMode: forcedProbe ? 'forced' : 'auto', finishReason: payload.choices[0].finish_reason ?? null, message: supportsToolCalls ? 'Connection and tool-calling test successful.' : 'Connection succeeded, but the model did not call the offered tool after an explicit function-call request.' });
    } catch (error) {
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return sendJson(response, isTimeout ? 504 : 502, { ok: false, error: { code: isTimeout ? 'MODEL_TIMEOUT' : 'MODEL_REQUEST_FAILED', message: isTimeout ? 'The connection test timed out. Check the provider service and timeout setting.' : 'Could not connect to the configured model endpoint. Check the URL and network access.' } });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/ai/structure-plan') {
    if (!allowPlanRequest(request, response)) return;
    if (planningInFlight >= maxPlanningConcurrency) return sendJson(response, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'The planning service is busy. Retry shortly.' } });
    planningInFlight += 1;
    const clientAbortController = new AbortController();
    const generationLog = [];
    const streamEvents = url.searchParams.get('stream') === '1';
    let streamStarted = false;
    const publishPlanEvent = (event) => {
      const entry = { at: new Date().toISOString(), ...event };
      generationLog.push(entry);
      if (streamStarted && !response.destroyed) response.write(`event: progress\ndata: ${JSON.stringify(entry)}\n\n`);
    };
    const abortOnClientClose = () => { if (!response.writableEnded) clientAbortController.abort(); };
    request.once('aborted', abortOnClientClose);
    response.once('close', abortOnClientClose);
    try {
      const input = await readJson(request);
      const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
      const image = input?.referenceImage;
      if (image && typeof image.dataUrl !== 'string') return sendJson(response, 400, { ok: false, error: { code: 'INVALID_IMAGE', message: 'Reference image data is invalid.' } });
      const hasImage = typeof image?.dataUrl === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(image.dataUrl);
      if (image && !hasImage) return sendJson(response, 400, { ok: false, error: { code: 'INVALID_IMAGE', message: 'Use a PNG, JPEG, WebP, or GIF reference image.' } });
      if ((!prompt && !hasImage) || prompt.length > 6000) return sendJson(response, 400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Add a building description or a supported reference image. Descriptions must be 6,000 characters or less.' } });
      if (hasImage && image.dataUrl.length > 7_000_000) return sendJson(response, 413, { ok: false, error: { code: 'IMAGE_TOO_LARGE', message: 'Reference image is too large. Use an image smaller than 5 MB.' } });
      const config = serviceConfig();
      if (!config) return sendJson(response, 503, { ok: false, error: { code: 'MODEL_NOT_CONFIGURED', message: 'The unified building model for text and reference images is not configured.' } });
      const constraints = input.constraints && typeof input.constraints === 'object' ? input.constraints : {};
      const type = typeof constraints.type === 'string' ? constraints.type.slice(0, 40) : '';
      const style = typeof constraints.style === 'string' ? constraints.style.slice(0, 40) : '';
      const floors = Number.isInteger(constraints.floors) ? Math.max(1, Math.min(64, constraints.floors)) : null;
      const width = Number.isInteger(constraints.width) ? Math.max(8, Math.min(512, constraints.width)) : null;
      const height = Number.isInteger(constraints.height) ? Math.max(8, Math.min(512, constraints.height)) : null;
      const length = Number.isInteger(constraints.length) ? Math.max(8, Math.min(512, constraints.length)) : null;
      const sizeMode = constraints.sizeMode === 'envelope' && hasImage ? 'envelope' : 'exact';
      const detailLevel = Number.isInteger(constraints.detailLevel) ? Math.max(1, Math.min(5, constraints.detailLevel)) : null;
      const includeInterior = constraints.includeInterior !== false;
      const isLightFixture = /\blantern\b|\blamp\b|chandelier|\u706f\u7b3c|\u540a\u706f|\u706f\u5177/i.test(prompt);
      const interiorSpec = !includeInterior
        ? 'Exterior-only build; omit interior furnishings.'
        : hasImage
          ? isLightFixture
            ? 'OBJECT reconstruction, not a habitable building. Complete the pictured fixture as a physical 3D object, preserve its visible housing, frame, panels, crown and hanging details, and place an actual minecraft:sea_lantern inside its housing cavity. Do not add rooms, floors, corridors or furniture.'
            : 'Infer the subject category and intended function from the original image first. Complete its hidden geometry consistently with visible evidence. For buildings provide usable interior rooms, circulation, furniture and lights; for objects reconstruct their physical internals without adding habitable rooms.'
        : isLightFixture
          ? 'This is an OBJECT reconstruction, not a habitable building. Do not add rooms, floors, corridors, furniture or building-sized interiors. Construct the lantern housing, frame, translucent panels, cap, chain and tassels from the reference. Put one actual minecraft:sea_lantern inside the housing cavity; keep the cap and frame proportional to the image outline.'
        : detailLevel >= 4
          ? 'Create a complete, walkable and furnished interior while preserving the requested exterior. Return connected named rooms on occupied floors, corridors, partitions, floors and ceilings, stairs, door/window openings, lighting, beds, tables, chairs, storage, kitchen, bath and service rooms. Tag room, partition, circulation, furniture and lighting geometry parts. For enclosed buildings include at least two rooms and three separate furniture parts. Do not return an empty shell.'
          : 'Include a walkable room layout with connecting stairs, doors, windows and essential furnishings.';
      const blockBudget = Math.max(10000, Math.min(12000000, Number(process.env.CRAFTAIB_MAX_GENERATED_BLOCKS || 12000000)));
      const referencePriority = hasImage
        ? 'The uploaded reference image is authoritative for building type, silhouette, proportions, visible parts, roof, openings and materials. The text description is secondary and may only add compatible details.'
        : '';
      const requestedSize = width && height && length
        ? hasImage
          ? `Maximum envelope ${width} x ${height} x ${length} blocks. The image defines the proportions: choose actual dimensions at or below every envelope axis, preserve the reference proportions, and do not pad unused space.`
          : `${width} x ${height} x ${length} blocks (hard dimensions; fill the requested footprint, do not leave a compact centered build)`
        : '';
      const constraintText = [referencePriority, style, type, floors && `${floors} floors`, requestedSize, detailLevel && `detail level ${detailLevel} of 5`, interiorSpec, `Keep geometry.parts to at most 1024 parts and estimated solid block count under ${blockBudget} blocks.`].filter(Boolean).join(", ");
      if (streamEvents) {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        response.flushHeaders?.();
        streamStarted = true;
        publishPlanEvent({ stage: 'request_ready', turn: 0, ok: true, message: hasImage ? 'Reference image and constraints are ready; starting the unified model.' : 'Constraints are ready; starting the building model.' });
      }
      const rawPlan = await planBuildingWithModel({
        prompt: [constraintText, prompt].filter(Boolean).join('. '),
        seed: Number.isInteger(input.seed) ? input.seed : 42,
        constraints: { type, style, floors, width, height, length, sizeMode, detailLevel, includeInterior },
        referenceImage: hasImage ? { dataUrl: image.dataUrl, referenceFeatures: image.referenceFeatures } : undefined,
      }, {
        ...config,
        maxRetries: config.retries,
        requestTimeoutMs: config.timeoutMs,
        signal: clientAbortController.signal,
        onToolEvent: publishPlanEvent,
        renderPreview: (grid, plan) => renderVoxelReview(grid, plan.referenceFacing),
      });
      const sizedPlan = !hasImage && width && height && length ? fitStructurePlanToEnvelope(rawPlan, { width, height, length }) : rawPlan;
      const plan = ensureLanternCore(sizedPlan, prompt);
      try {
        validateStructurePlan(plan);
        const dimensionsMismatch = sizeMode === 'envelope'
          ? (width && plan.dimensions.width > width) || (height && plan.dimensions.height > height) || (length && plan.dimensions.length > length)
          : (width && plan.dimensions.width !== width) || (height && plan.dimensions.height !== height) || (length && plan.dimensions.length !== length);
        if (dimensionsMismatch) throw new Error(hasImage && sizeMode === 'envelope'
          ? 'The visual plan exceeds the selected maximum size. Keep its image proportions and fit it within the target envelope.'
          : hasImage
            ? 'The visual plan dimensions do not match the requested size. Retry with a size that preserves the reference proportions, or let the image determine dimensions.'
          : 'The model plan dimensions do not match the requested block dimensions.');
        let generatedBlockCount;
        let generatedGrid;
        let interiorAudit;
        try {
          // Geometry parts overlap heavily for shells, roofs, rooms, and facade details.
          // Measure the deduplicated BlockGrid instead of summing every part envelope.
          generatedGrid = structurePlanToGrid(plan);
          generatedBlockCount = generatedGrid.cells.length;
          interiorAudit = summarizeInteriorVoxelization(plan, generatedGrid.cells, `${prompt} ${plan.type} ${plan.name}`);
        } catch (error) {
          if (/exceeds the .* block limit|too large/i.test(error instanceof Error ? error.message : '')) {
            throw new Error('The requested building is too large for the current generation budget. Reduce its dimensions or detail level.');
          }
          throw error;
        }
        if (generatedBlockCount > blockBudget) throw new Error(`The requested building would place ${generatedBlockCount.toLocaleString()} blocks, above the ${blockBudget.toLocaleString()} block budget. Reduce its dimensions or detail level.`);
        publishPlanEvent({ stage: 'grid_validation', ok: generatedBlockCount > 0, blocks: generatedBlockCount, regions: plan.regions.length, interiorBlocks: interiorAudit.occupiedBlocks, interiorLights: interiorAudit.lightBlocks, message: generatedBlockCount ? `Validated final BlockGrid; ${interiorAudit.occupiedBlocks} occupied interior voxels, ${interiorAudit.lightBlocks} interior lights.` : 'The final BlockGrid is empty.' });
        if (generatedBlockCount === 0) throw Object.assign(new Error('The model plan produced an empty BlockGrid; no structure was generated.'), { statusCode: 422, code: 'EMPTY_BLOCK_GRID' });
        if (includeInterior && detailLevel >= 4 && (!plan.inference?.category || ['building', 'object'].includes(plan.inference.category)) && !/statue|sculpture|monument/i.test(`${plan.type} ${plan.name}`)) {
          const isGeneratedLightFixture = /\blantern\b|\blamp\b|chandelier|\u706f\u7b3c|\u540a\u706f|\u706f\u5177/i.test(`${prompt} ${plan.type} ${plan.name}`);
          if (isGeneratedLightFixture) {
            const regions = plan.regions ?? [];
            const chamber = regions.find((region) => /chamber|interior|lantern.?body/i.test(`${region.name} ${region.role}`) && region.width >= 3 && region.height >= 3 && region.length >= 3)
              ?? regions.filter((region) => region.width >= 3 && region.height >= 3 && region.length >= 3 && !/roof|spire|dome|battlement|apron|crown|tassel/i.test(`${region.name} ${region.role}`)).sort((a, b) => b.width * b.height * b.length - a.width * a.height * a.length)[0]
              ?? { x: 0, y: 0, z: 0, ...plan.dimensions };
            const hasInteriorLight = chamber && generatedGrid.cells.some((cell) => cell.block.id === 'minecraft:sea_lantern'
              && cell.x > chamber.x && cell.x < chamber.x + chamber.width - 1
              && cell.y > chamber.y && cell.y < chamber.y + chamber.height - 1
              && cell.z > chamber.z && cell.z < chamber.z + chamber.length - 1);
            if (!hasInteriorLight) throw new Error('The lantern is only a decorative shell. Place a minecraft:sea_lantern inside its chamber before finishing.');
          } else if (!plan.inference?.category || plan.inference.category === 'building') {
            const parts = plan.geometry?.parts ?? [];
            const purposes = new Set(parts.map((part) => part.purpose));
            const furnitureCount = parts.filter((part) => part.purpose === 'furniture').length;
            const interiorRegions = (plan.regions ?? []).filter((region) => /room|barracks|guard|residential|chamber|kitchen|service|corridor|passage|hall|store|watch|keep|interior/i.test(`${region.name} ${region.role}`));
            const hasRooms = purposes.has('room') || (plan.rooms?.length ?? 0) >= 2 || interiorRegions.length >= 2;
            const hasCirculation = purposes.has('circulation') || interiorRegions.some((region) => /corridor|passage|stairs|connected|circulation/i.test(`${region.name} ${region.role}`));
            const hasFurniture = furnitureCount >= 3 || (plan.components ?? []).filter((component) => /furniture|table|chair|bed|storage|lamp|kitchen|counter/i.test(`${component.id} ${component.type}`)).length >= 3 || ((plan.rooms?.length ?? 0) >= 2 && interiorRegions.length >= 2);
            if (!hasRooms || !hasCirculation || !hasFurniture) throw new Error('The high-detail plan is missing interior rooms, circulation, or furniture. Retry with a smaller building or lower detail level.');
            if (interiorAudit.occupiedBlocks < 3 || interiorAudit.lightBlocks < 1) throw new Error(`The high-detail plan only describes its interior: the voxel grid has ${interiorAudit.occupiedBlocks} interior blocks and ${interiorAudit.lightBlocks} interior lights. Place actual furnishings and lighting inside the room bounds.`);
          }
        }
      } catch (error) {
        throw Object.assign(new Error(error instanceof Error ? error.message : 'The model returned an invalid building plan.'), { statusCode: 422, code: 'INVALID_STRUCTURE_PLAN' });
      }
      if (streamStarted) {
        response.write(`event: result\ndata: ${JSON.stringify({ payload: { ok: true, plan }, generationLog })}\n\n`);
        return response.end();
      }
      return sendJson(response, 200, { ok: true, plan, generationLog });
    } catch (error) {
      if (clientAbortController.signal.aborted || response.destroyed) return;
      const status = Number(error?.statusCode) || 502;
      const code = error?.code || (status === 422 ? 'INVALID_STRUCTURE_PLAN' : status === 502 ? 'MODEL_REQUEST_FAILED' : 'INVALID_REQUEST');
      const message = error?.message || 'The AI service could not produce a valid building plan.';
      if (streamStarted) {
        response.write(`event: failure\ndata: ${JSON.stringify({ statusCode: status, payload: { ok: false, error: { code, message }, generationLog } })}\n\n`);
        return response.end();
      }
      return sendJson(response, status, { ok: false, error: { code, message }, generationLog });
    } finally {
      request.off('aborted', abortOnClientClose);
      response.off('close', abortOnClientClose);
      planningInFlight -= 1;
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
