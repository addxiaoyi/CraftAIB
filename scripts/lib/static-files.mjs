import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.wasm': 'application/wasm' };

function acceptedEncodings(header = '') {
  const weights = new Map();
  for (const part of header.split(',')) {
    const [name, ...parameters] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const quality = parameters.find((value) => value.trim().startsWith('q='));
    const weight = quality === undefined ? 1 : Number(quality.trim().slice(2));
    weights.set(name, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0);
  }
  const identity = weights.get('identity') ?? (weights.get('*') === 0 ? 0 : 1);
  const candidates = ['br', 'gzip'].map((name) => ({ name, weight: weights.get(name) ?? weights.get('*') ?? 0 })).filter(({ weight }) => weight > 0);
  if (identity > 0 && weights.has('identity')) candidates.push({ name: 'identity', weight: identity });
  candidates.sort((a, b) => b.weight - a.weight);
  if (identity > 0 && !weights.has('identity')) candidates.push({ name: 'identity', weight: identity });
  return candidates.map(({ name }) => name);
}

async function fileInfo(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

/** Serve build-time compression without spending request time recompressing large assets. */
export async function serveStatic(root, pathname, request, response) {
  let relative;
  try { relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^[/\\]+/, ''); }
  catch { return false; }
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return false;
  const original = await fileInfo(file);
  if (!original) return false;
  let selected;
  for (const encoding of acceptedEncodings(request.headers['accept-encoding'])) {
    if (encoding === 'identity') { selected = { file, info: original }; break; }
    const compressedFile = `${file}.${encoding === 'br' ? 'br' : 'gz'}`;
    const info = await fileInfo(compressedFile);
    // A local rebuild may have replaced the source while leaving older compressed files.
    if (info && info.mtimeMs >= original.mtimeMs) { selected = { file: compressedFile, info, encoding }; break; }
  }
  if (!selected) {
    response.writeHead(406, { vary: 'Accept-Encoding', 'content-length': '0' }).end();
    return true;
  }
  const headers = {
    'content-type': mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': selected.info.size,
    vary: 'Accept-Encoding',
    ...(selected.encoding ? { 'content-encoding': selected.encoding } : {}),
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') { response.end(); return true; }
  pipeline(createReadStream(selected.file), response, (error) => {
    if (error && !['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'EPIPE'].includes(error.code)) console.error(`Static asset stream failed: ${file}`, error);
  });
  return true;
}
