import type { BlockGrid } from '@craftaib/core';
import { validateGrid } from '@craftaib/core';

export function serializeGlb(grid: BlockGrid): Uint8Array {
  validateGrid(grid);
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = []; let vertex = 0;
  for (const cell of grid.cells) {
    if (cell.block.id === 'minecraft:air') continue;
    const { r, g, b } = blockColor(cell.block.id);
    const x = cell.x, y = cell.y, z = cell.z;
    positions.push(x,y,z,x+1,y,z,x+1,y+1,z,x,y+1,z,x,y,z+1,x+1,y,z+1,x+1,y+1,z+1,x,y+1,z+1);
    for (let i = 0; i < 8; i += 1) colors.push(r, g, b, 1);
    const faces = [[0,1,2,0,2,3],[5,4,7,5,7,6],[4,0,3,4,3,7],[1,5,6,1,6,2],[3,2,6,3,6,7],[4,5,1,4,1,0]];
    for (const face of faces) indices.push(...face.map((index) => index + vertex));
    vertex += 8;
  }
  const positionBytes = new Uint8Array(new Float32Array(positions).buffer);
  const colorBytes = new Uint8Array(new Float32Array(colors).buffer);
  const indexBytes = new Uint8Array(new Uint32Array(indices).buffer);
  const colorOffset = positionBytes.byteLength; const indexOffset = colorOffset + colorBytes.byteLength; const bin = concat(concat(positionBytes, colorBytes), indexBytes);
  const json = JSON.stringify({ asset: { version: '2.0', generator: 'CraftAIB' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true }] , buffers: [{ byteLength: bin.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 }, { buffer: 0, byteOffset: colorOffset, byteLength: colorBytes.byteLength, target: 34962 }, { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 }], accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0,0,0], max: [grid.width,grid.height,grid.length] }, { bufferView: 1, componentType: 5126, count: colors.length / 4, type: 'VEC4' }, { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' }] });
  return makeGlb(json, bin);
}

function blockColor(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; const h = (hash % 360) / 60; const c = 0.55; const x = c * (1 - Math.abs(h % 2 - 1)); const values = h < 1 ? [c,x,0] : h < 2 ? [x,c,0] : h < 3 ? [0,c,x] : h < 4 ? [0,x,c] : h < 5 ? [x,0,c] : [c,0,x]; return { r: values[0] + 0.25, g: values[1] + 0.25, b: values[2] + 0.25 }; }
function concat(a: Uint8Array, b: Uint8Array) { const out = new Uint8Array(a.byteLength + b.byteLength); out.set(a); out.set(b, a.byteLength); return out; }
function makeGlb(json: string, bin: Uint8Array) { const jsonBytes = new TextEncoder().encode(json); const jsonPad = (4 - (jsonBytes.length % 4)) % 4; const binPad = (4 - (bin.length % 4)) % 4; const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad; const out = new Uint8Array(total); const view = new DataView(out.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true); let offset = 12; view.setUint32(offset, jsonBytes.length + jsonPad, true); view.setUint32(offset + 4, 0x4e4f534a, true); offset += 8; out.set(jsonBytes, offset); offset += jsonBytes.length + jsonPad; view.setUint32(offset, bin.length + binPad, true); view.setUint32(offset + 4, 0x004e4942, true); offset += 8; out.set(bin, offset); return out; }
