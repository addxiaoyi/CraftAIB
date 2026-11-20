import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { strToU8, zipSync, unzipSync, gzipSync, gunzipSync } from 'fflate';
import { blockStateKey, createGrid, stringifyEngineJson } from '../packages/core/dist/index.js';
import { serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes, parseLitematicaPlacements, serializeNativeLitematicaPlacement } from '../packages/craftmatic-adapter/dist/index.js';

const output = resolve(process.env.CRAFTAIB_CLIENT_OUTPUT || 'outputs/client-acceptance');
await mkdir(output, { recursive: true });
const tag = (type, value) => ({ type, value });
const compound = (value) => tag('compound', value);
const block = (x, y, z, id, properties) => ({ x, y, z, block: { id, ...(properties ? { properties } : {}) } });
const floor = (width, length) => Array.from({ length: width * length }, (_, index) => block(index % width, 0, Math.floor(index / width), 'minecraft:smooth_stone'));
const directionCells = floor(9, 9);
for (const [x, z, facing] of [[1, 1, 'north'], [7, 1, 'east'], [7, 7, 'south'], [1, 7, 'west']]) {
  directionCells.push(block(x, 1, z, 'minecraft:oak_stairs', { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' }));
}
directionCells.push(block(3, 1, 4, 'minecraft:oak_log', { axis: 'x' }), block(4, 1, 4, 'minecraft:oak_log', { axis: 'y' }), block(5, 1, 4, 'minecraft:oak_log', { axis: 'z' }));
for (const [y, half] of [[1, 'lower'], [2, 'upper']]) directionCells.push(block(4, y, 1, 'minecraft:oak_door', { facing: 'north', half, hinge: 'left', open: 'false', powered: 'false' }));
directionCells.push(block(4, 1, 7, 'minecraft:gold_block'));
const directions = createGrid(directionCells, { width: 9, height: 3, length: 9 });
const containers = createGrid([...floor(3, 3), block(1, 1, 1, 'minecraft:chest', { facing: 'east', type: 'single', waterlogged: 'false' })], { width: 3, height: 2, length: 3 });
containers.metadata = { blockEntities: [compound({
  id: tag('string', 'minecraft:chest'), x: tag('int', 1), y: tag('int', 1), z: tag('int', 1),
  CustomName: tag('string', JSON.stringify({ text: 'CraftAIB acceptance' })),
  Items: tag('list', { type: 'compound', value: [
    compound({ Slot: tag('byte', 0), Count: tag('byte', 7), id: tag('string', 'minecraft:diamond') }),
    compound({ Slot: tag('byte', 8), Count: tag('byte', 16), id: tag('string', 'minecraft:stone') }),
  ] }),
})] };
const regions = [
  { name: 'Directions', grid: directions, position: { x: -4, y: 0, z: -4 } },
  { name: 'Container', grid: containers, position: { x: 7, y: 0, z: -3 } },
];
// Native gzip headers carry an OS byte; normalize package compression for identical hashes across hosts.
const portableGzip = (bytes) => gzipSync(gunzipSync(bytes), { mtime: 0 });
const bytes = portableGzip(await serializeLitematicaRegions(regions, { name: 'CraftAIB client acceptance', author: 'CraftAIB', minecraftDataVersion: 3465 }));
const parsed = await parseLitematicaDocumentBytes(bytes);
assert.deepEqual(parsed.regions.map((region) => region.name), ['Directions', 'Container']);
for (const [index, region] of regions.entries()) {
  const keys = (cells) => cells.map((cell) => `${cell.x},${cell.y},${cell.z}:${blockStateKey(cell.block)}`).sort();
  assert.deepEqual(keys(parsed.regions[index].cells), keys(region.grid.cells.map((cell) => ({ ...cell, x: cell.x + region.position.x, y: cell.y + region.position.y, z: cell.z + region.position.z }))));
}
const chestNbt = parsed.regions[1].blockEntities[0].nbt;
assert.equal(chestNbt.Items.value.value[0].Slot.value, 0);
assert.equal(chestNbt.Items.value.value[0].Count.value, 7);
assert.equal(chestNbt.Items.value.value[1].Count.value, 16);
assert.equal(chestNbt.CustomName.value, '{"text":"CraftAIB acceptance"}');

const placements = [
  { name: 'Baseline', x: 100, rotation: 'none', mirror: 'none' },
  { name: 'Clockwise90', x: 140, rotation: 'clockwise_90', mirror: 'none' },
  { name: 'MirrorNorthSouth', x: 180, rotation: 'none', mirror: 'left_right' },
  { name: 'MirrorThenRotate', x: 220, rotation: 'clockwise_90', mirror: 'left_right' },
].map((preset) => ({ name: preset.name, schematic: 'REPLACE_WITH_ABSOLUTE_PATH/client-acceptance.litematic',
  position: { x: preset.x, y: 64, z: 100 }, enabled: true, renderEnclosingBox: true,
  rotation: preset.rotation, mirror: preset.mirror,
  regions: regions.map((region) => ({ name: region.name, position: region.position, enabled: true, rotation: 'none', mirror: 'none' })),
}));
const native = placements.map((placement) => JSON.parse(serializeNativeLitematicaPlacement(placement)));
const manager = { placements: native, selected: 0, origin_selected: true };
const imported = parseLitematicaPlacements(manager);
assert.equal(imported.placements.length, 4);
assert.deepEqual(imported.placements[2].regions[1].position, { x: 7, y: 0, z: -3 });
const checkpoints = [
  { name: 'Baseline', chest: [108, 65, 98], chestFacing: 'east', northStair: [97, 65, 97], stairFacing: 'north', gold: [100, 65, 103] },
  { name: 'Clockwise90', chest: [142, 65, 108], chestFacing: 'south', northStair: [143, 65, 97], stairFacing: 'east', gold: [137, 65, 100] },
  { name: 'MirrorNorthSouth', chest: [188, 65, 102], chestFacing: 'east', northStair: [177, 65, 103], stairFacing: 'south', gold: [180, 65, 97] },
  { name: 'MirrorThenRotate', chest: [218, 65, 108], chestFacing: 'south', northStair: [217, 65, 97], stairFacing: 'west', gold: [223, 65, 100] },
];
const files = {
  'client-acceptance.litematic': bytes,
  'placements.craftaib.json': strToU8(JSON.stringify({ placements, selected: 0 }, null, 2)),
  'placements.native-template.json': strToU8(JSON.stringify(manager, null, 2)),
  'expected.json': strToU8(JSON.stringify({ minecraft: 'Java 1.20.1', dataVersion: 3465, blocks: directionCells.length + containers.cells.length, regions: 2,
    checkpoints, container: { title: 'CraftAIB acceptance', slots: { 0: { item: 'minecraft:diamond', count: 7 }, 8: { item: 'minecraft:stone', count: 16 } } },
    completed: { parsedCoordinates: true, parsedBlockStates: true, parsedContainerNbt: true, nativePlacementSchema: true },
    pending: ['Minecraft loading', 'projection alignment', 'creative paste and container inventory', 'native rotation/mirror', 'door hinge and log axis after transforms'],
    placementSchemaSource: 'maruohon/litematica afb3feb258aacdc52901217bec233e2bee880b21, SchematicPlacement/SubRegionPlacement',
  }, null, 2)),
  'prepare-placement.mjs': strToU8(`import { readFile, writeFile } from 'node:fs/promises';\nimport { isAbsolute } from 'node:path';\nconst schematic = process.argv[2];\nif (!schematic || !isAbsolute(schematic)) throw new Error('Pass the absolute path to client-acceptance.litematic in your Minecraft instance.');\nawait readFile(schematic);\nconst manager = JSON.parse(await readFile(new URL('./placements.native-template.json', import.meta.url), 'utf8'));\nfor (const placement of manager.placements) placement.schematic = schematic;\nawait writeFile(new URL('./placements.native-ready.json', import.meta.url), JSON.stringify(manager, null, 2));\nconsole.log('Created placements.native-ready.json; no Minecraft configuration was changed.');\n`),
  'RESULTS.md': strToU8('# 客户端验收记录\n\n状态：尚未在 Minecraft 客户端执行。\n\n- Minecraft / Fabric / Litematica / MaLiLib 版本：\n- 测试世界：\n- 加载 schematic 与两个区域：待测\n- 四组原点、楼梯朝向、原木轴向与门铰链：待测\n- 创造模式粘贴后箱子名称和物品数量：待测\n- 地标坐标与 expected.json 一致：待测\n- 关闭并重开客户端后的 placement 保留：待测\n- 截图 / 日志路径：\n'),
  'README.md': strToU8(`# Minecraft / Litematica 客户端验收包

目标基线：Minecraft Java 1.20.1，安装与该版本匹配的 Litematica 和 MaLiLib。此包已经过二进制回读，游戏内结果仍待实测。使用单独的创造模式超平坦测试世界。

1. 将 client-acceptance.litematic 复制到该实例的 schematics 目录，在 Litematica 的 Load Schematics 中加载。应出现 Directions 和 Container 两个区域，合计 101 个方块。
2. 按 placements.craftaib.json 的四组坐标创建放置：原点分别为 (100/140/180/220,64,100)，旋转和镜像见 expected.json。原始 schematic 的负坐标区域应保留。原生变换绕 placement 原点进行。
3. 若需要直接核对原生 JSON，运行 node prepare-placement.mjs "绝对路径/client-acceptance.litematic"。输出 placements.native-ready.json 是 placement manager 内容，不能整份覆盖客户端配置。关闭测试客户端、备份对应世界/维度配置后，仅将该内容放入其顶层 placements 属性，保留其他属性；也可全程使用客户端界面手动配置。
4. 核对 expected.json 的箱子、北楼梯和金块坐标。基线四角楼梯依次朝北、东、南、西；中间三根原木分别为 X/Y/Z 轴。90° 旋转交换 X/Z 轴，Y 不变；镜像后门的铰链也应正确改变。
5. 投影本身不能证明容器内容正确。在这个测试世界使用创造模式粘贴，再打开箱子。应名为 CraftAIB acceptance，槽位 0 有 7 颗钻石，槽位 8 有 16 块石头，其余为空。可用 /data get block 108 65 98 Items 核对基线箱子。生存 Easy Place 不作为容器 NBT 的验收方式。
6. 保存并重开客户端，核对区域启用状态、放置位置、镜像与旋转仍保留。将实际版本、截图和结果填入 RESULTS.md。

placements.craftaib.json 为 CraftAIB 内部可移植格式；placements.native-template.json 为上述 Litematica 版本的原生格式，两者明确区分。客户端 JSON 结构依据上游提交 afb3feb258aacdc52901217bec233e2bee880b21。

nbt-fidelity.litematic 仅用于文件往返检查，包含 long 和 byte array 边界值。额外自定义标签不保证被 Minecraft 保存，不能把它当作游戏持久化标准。MANIFEST.json 列出每个交付文件的 SHA-256。
`),
};

const fidelity = createGrid([block(0, 0, 0, 'minecraft:chest', { facing: 'north', type: 'single', waterlogged: 'false' })], { width: 1, height: 1, length: 1 });
fidelity.metadata = { blockEntities: [compound({ id: tag('string', 'minecraft:chest'), x: tag('int', 0), y: tag('int', 0), z: tag('int', 0),
  CraftAIBFileOnly: compound({ long: tag('long', -9223372036854775807n), bytes: tag('byteArray', new Uint8Array([0, 128, 255])) }),
})] };
files['nbt-fidelity.litematic'] = portableGzip(await serializeLitematicaRegions([{ name: 'FileOnly', grid: fidelity, position: { x: -7, y: 4, z: 9 } }], { minecraftDataVersion: 3465 }));
const fidelityRoundTrip = await parseLitematicaDocumentBytes(files['nbt-fidelity.litematic']);
assert.equal(fidelityRoundTrip.regions[0].blockEntities[0].nbt.CraftAIBFileOnly.value.long.value, -9223372036854775807n);
assert.deepEqual(fidelityRoundTrip.regions[0].blockEntities[0].nbt.CraftAIBFileOnly.value.bytes.value, new Uint8Array([0, 128, 255]));
files['nbt-fidelity.expected.json'] = strToU8(stringifyEngineJson(fidelityRoundTrip, 2));
const manifest = Object.entries(files).map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
files['MANIFEST.json'] = strToU8(JSON.stringify({ files: manifest }, null, 2));
for (const [name, bytes] of Object.entries(files)) await writeFile(resolve(output, name), bytes);
const archive = zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { mtime: new Date(2026, 10, 4) }]])), { level: 6 });
const unpacked = unzipSync(archive);
for (const file of manifest) assert.equal(createHash('sha256').update(unpacked[file.name]).digest('hex'), file.sha256);
await writeFile(resolve(output, 'craftaib-client-acceptance.zip'), archive);
console.log(JSON.stringify({ output, files: manifest.length, blocks: directionCells.length + containers.cells.length, regions: 2,
  packageSha256: createHash('sha256').update(archive).digest('hex'), nativePlacementRoundTrip: true, gameClientExecuted: false }, null, 2));
