import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the remote Minecraft texture source used by the 3D viewer.
 *
 * Two invariants are enforced:
 *  1. The texture source version is declared once, as a constant, and the base URL is derived
 *     from it, so no second hardcoded version can drift away from it.
 *  2. The declared version is the newest Minecraft release the CDN actually serves for the
 *     blocks the viewer renders (currently 26.3 — `bush`, introduced after 1.21.4, resolves
 *     there but 404s at 1.21.4).
 *
 * A missing texture must never reach Three.js as an undefined map: `FALLBACK_TEXTURE_URL` has to
 * keep deriving from the same base so the stone fallback follows the version automatically.
 *
 * Network checks are skipped with `--offline`; every other assertion is static.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../frontend/src/components/ThreeViewport.tsx');
const source = readFileSync(sourcePath, 'utf8');

const REQUIRED_VERSION = '26.3';
const STATIC_SAMPLE = ['stone', 'bush', 'pale_oak_planks', 'glass_pane_top', 'water_still'];
const offline = process.argv.includes('--offline');

const versionMatch = source.match(/const MINECRAFT_TEXTURE_VERSION\s*=\s*'([^']+)'/);
assert.ok(
  versionMatch,
  'ThreeViewport must declare `const MINECRAFT_TEXTURE_VERSION`, not an inline version inside the base URL',
);
const version = versionMatch[1];
assert.equal(
  version,
  REQUIRED_VERSION,
  `viewer texture source must support Minecraft up to ${REQUIRED_VERSION}, found ${version}`,
);

assert.ok(
  source.includes(
    'const MINECRAFT_TEXTURE_BASE = `https://assets.mcasset.cloud/${MINECRAFT_TEXTURE_VERSION}/assets/minecraft/textures/block/`;',
  ),
  'MINECRAFT_TEXTURE_BASE must be derived from MINECRAFT_TEXTURE_VERSION',
);

assert.ok(
  !/assets\.mcasset\.cloud\/(?!\$\{MINECRAFT_TEXTURE_VERSION\})/.test(source),
  'no texture URL may pin a literal Minecraft version',
);

assert.ok(
  source.includes('const FALLBACK_TEXTURE_URL = `${MINECRAFT_TEXTURE_BASE}stone.png`;'),
  'FALLBACK_TEXTURE_URL must derive from MINECRAFT_TEXTURE_BASE so the fallback follows the version',
);

if (!offline) {
  const base = `https://assets.mcasset.cloud/${version}/assets/minecraft/textures/block/`;
  const results = await Promise.all(
    STATIC_SAMPLE.map(async (name) => {
      const response = await fetch(`${base}${name}.png`, { method: 'HEAD' });
      return { name, status: response.status };
    }),
  );
  const missing = results.filter((entry) => entry.status !== 200);
  assert.deepEqual(
    missing,
    [],
    `textures missing from the ${version} CDN source: ${JSON.stringify(missing)}`,
  );
  console.log(
    `texture source: version=${version} sample=${results.map((entry) => `${entry.name}:${entry.status}`).join(',')}`,
  );
}

console.log('Minecraft texture source passed.');
