import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';

const versions = JSON.parse(await readFile('fixtures/client-instance-1.20.1.json', 'utf8'));
const output = resolve('outputs/client-instance-1.20.1');
const instance = resolve(output, 'instance');
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const archiveFiles = {};
const downloaded = [];

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'CraftAIB/0.1 acceptance' } });
  if (!response.ok) throw new Error(`Client preparation download failed (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function preserveFile(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.equal(hash(await readFile(path)), hash(bytes), `Existing instance file differs; preserve it and choose a fresh output directory: ${path}`);
  }
}

for (const mod of versions.mods) {
  const path = `mods/${mod.filename}`;
  assert.match(mod.filename, /^[a-zA-Z0-9._+-]+\.jar$/);
  let bytes;
  try { bytes = await readFile(resolve(instance, path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  bytes ??= await download(mod.url);
  assert.equal(bytes.length, mod.size, `${mod.filename}: unexpected download size`);
  for (const [algorithm, expected] of Object.entries(mod.hashes)) assert.equal(hash(bytes, algorithm), expected, `${mod.filename}: ${algorithm} mismatch`);
  const content = unzipSync(bytes, { filter: (entry) => entry.name === 'fabric.mod.json' });
  const metadata = JSON.parse(strFromU8(content['fabric.mod.json']));
  assert.equal(metadata.version, mod.version);
  await preserveFile(resolve(instance, path), bytes);
  downloaded.push({ path, version: metadata.version, hashes: mod.hashes, fileSize: bytes.length, downloads: [mod.url], env: { client: 'required', server: 'unsupported' } });
}

const acceptance = resolve('outputs/client-acceptance');
for (const name of await readdir(acceptance)) {
  if (!/\.(?:md|json|mjs|litematic)$/.test(name)) continue;
  const bytes = await readFile(resolve(acceptance, name));
  const path = name.endsWith('.litematic') ? `schematics/${name}` : `craftaib-acceptance/${name}`;
  archiveFiles[`overrides/${path}`] = bytes;
  await preserveFile(resolve(instance, path), bytes);
}
const index = {
  formatVersion: 1, game: 'minecraft', versionId: '2026-11-06',
  name: 'CraftAIB Acceptance 1.20.1', summary: 'Isolated Litematica orientation, container NBT and placement acceptance.',
  dependencies: { minecraft: versions.minecraft, 'fabric-loader': versions.fabricLoader },
  files: downloaded.map(({ version, ...file }) => file),
};
archiveFiles['modrinth.index.json'] = strToU8(JSON.stringify(index, null, 2));
const archive = zipSync(Object.fromEntries(Object.entries(archiveFiles).map(([path, bytes]) => [path, [bytes, { mtime: new Date('2026-11-06T00:00:00Z') }]])), { level: 6 });
const unpacked = unzipSync(archive);
for (const [path, bytes] of Object.entries(archiveFiles)) assert.equal(hash(unpacked[path]), hash(bytes), `Pack round trip failed: ${path}`);
const archivePath = resolve(output, 'CraftAIB-Acceptance-1.20.1.mrpack');
await writeFile(archivePath, archive);
const readme = `# CraftAIB 独立客户端验收实例\n\nMinecraft ${versions.minecraft} / Fabric Loader ${versions.fabricLoader} / Litematica 0.15.4 / MaLiLib 0.16.3。\n\n在支持 Modrinth 整合包的启动器中导入 CraftAIB-Acceptance-1.20.1.mrpack，使用新名称 CraftAIB-Acceptance-1.20.1 和独立游戏目录。启动器会安装 Minecraft、Fabric 和基础库。两项 Mod 已在 instance/mods 下载并核验 SHA-1、SHA-512，可供离线复用。\n\n完成正版登录后创建开启作弊的创造模式超平坦测试世界。验收文件位于 schematics/，按 craftaib-acceptance/README.md 检查四种旋转/镜像、箱子物品及重开后的 placement。填写同目录 RESULTS.md。\n\n当前状态：包完整性通过，尚未在游戏客户端执行；没有改动已有实例或存档，也没有包含账号凭据。\n`;
await writeFile(resolve(output, 'README.md'), readme);
const report = { minecraft: versions.minecraft, fabricLoader: versions.fabricLoader, mods: downloaded, instance, archivePath, archiveSha256: hash(archive), archiveFiles: Object.keys(archiveFiles).length, verifiedModDownloads: true, gameClientExecuted: false };
await writeFile(resolve(output, 'PREPARATION.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
