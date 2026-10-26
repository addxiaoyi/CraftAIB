import { deflateSync, crc32 } from 'node:zlib';

const DYES = { white: 0xcfd5d6, orange: 0xe06100, magenta: 0xa9309f, light_blue: 0x2489c7, yellow: 0xf0af15, lime: 0x5ea818, pink: 0xd5658e, gray: 0x36393d, light_gray: 0x7d7d73, cyan: 0x157788, purple: 0x64209c, blue: 0x2c2e8f, brown: 0x603b1f, green: 0x495b24, red: 0x8e2020, black: 0x141519 };
const MATERIALS = { sea_lantern: 0xb6d9cd, gold_block: 0xf9d849, iron_block: 0xd8d8d8, copper_block: 0xb66c4c, glass: 0xbdd9df, quartz: 0xe5e1d8, deepslate: 0x343438, blackstone: 0x28242a, dark_oak: 0x422b14, spruce: 0x725430, mangrove: 0x763631, crimson: 0x733547, warped: 0x2b6863, cherry: 0xe3b4ae, bamboo: 0xb5a74f, oak: 0xa88752, bricks: 0x975d4e, stone: 0x7b7b7b, tuff: 0x6b6b60 };

function blockColor(id) {
  const name = id.replace('minecraft:', '');
  for (const [dye, color] of Object.entries(DYES)) if (name.startsWith(`${dye}_`)) return color;
  for (const [material, color] of Object.entries(MATERIALS)) if (name.includes(material)) return color;
  return 0x929292;
}

function pngChunk(kind, content) {
  const type = Buffer.from(kind);
  const chunk = Buffer.alloc(content.length + 12);
  chunk.writeUInt32BE(content.length);
  type.copy(chunk, 4);
  content.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, content])), content.length + 8);
  return chunk;
}

/** Orthographic block-color views for model review; no texture or lighting inference. */
export function renderVoxelReview(grid, referenceFacing = 'z-min') {
  if (!grid.cells.length) throw new Error('Cannot render an empty voxel grid.');
  const size = 128;
  const width = size * 2;
  const rows = Buffer.alloc(width * (width * 3 + 1));
  for (let y = 0; y < width; y += 1) rows.fill(232, y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1));
  const bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const cell of grid.cells) {
    bounds.x0 = Math.min(bounds.x0, cell.x); bounds.x1 = Math.max(bounds.x1, cell.x);
    bounds.y0 = Math.min(bounds.y0, cell.y); bounds.y1 = Math.max(bounds.y1, cell.y);
    bounds.z0 = Math.min(bounds.z0, cell.z); bounds.z1 = Math.max(bounds.z1, cell.z);
  }
  const faces = [referenceFacing, referenceFacing === 'z-min' ? 'z-max' : referenceFacing === 'z-max' ? 'z-min' : referenceFacing === 'x-min' ? 'x-max' : 'x-min', referenceFacing.startsWith('x') ? 'z-min' : 'x-min', 'top'];
  for (const [tile, face] of faces.entries()) {
    const horizontal = face.startsWith('x') ? 'z' : 'x';
    const vertical = face === 'top' ? 'z' : 'y';
    const depthAxis = face === 'top' ? 'y' : face.startsWith('x') ? 'x' : 'z';
    const positive = face.endsWith('max') || face === 'top';
    const spanX = bounds[`${horizontal}1`] - bounds[`${horizontal}0`] + 1;
    const spanY = bounds[`${vertical}1`] - bounds[`${vertical}0`] + 1;
    const scale = Math.min((size - 16) / spanX, (size - 16) / spanY);
    const offsetX = (tile % 2) * size + (size - spanX * scale) / 2;
    const offsetY = Math.floor(tile / 2) * size + (size - spanY * scale) / 2;
    const depths = new Float64Array(size * size).fill(-Infinity);
    for (const cell of grid.cells) {
      const u = face.endsWith('max') ? bounds[`${horizontal}1`] - cell[horizontal] : cell[horizontal] - bounds[`${horizontal}0`];
      const v = bounds[`${vertical}1`] - cell[vertical];
      const depth = positive ? cell[depthAxis] : -cell[depthAxis];
      const rgb = blockColor(cell.block.id);
      const x0 = Math.max((tile % 2) * size, Math.floor(offsetX + u * scale));
      const y0 = Math.max(Math.floor(tile / 2) * size, Math.floor(offsetY + v * scale));
      for (let y = y0; y < Math.min(Math.floor(tile / 2) * size + size, Math.ceil(offsetY + (v + 1) * scale)); y += 1) {
        for (let x = x0; x < Math.min((tile % 2) * size + size, Math.ceil(offsetX + (u + 1) * scale)); x += 1) {
          const index = (y % size) * size + x % size;
          if (depths[index] > depth) continue;
          depths[index] = depth;
          const pixel = y * (width * 3 + 1) + 1 + x * 3;
          rows[pixel] = rgb >> 16 & 255; rows[pixel + 1] = rgb >> 8 & 255; rows[pixel + 2] = rgb & 255;
        }
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(width, 4); header[8] = 8; header[9] = 2;
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
