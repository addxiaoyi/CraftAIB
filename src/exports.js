const TAG = {
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
};

class NbtWriter {
  constructor() {
    this.bytes = [];
  }

  byte(value) { this.bytes.push(value & 0xff); }
  short(value) { this.byte(value >> 8); this.byte(value); }
  int(value) { this.byte(value >> 24); this.byte(value >> 16); this.byte(value >> 8); this.byte(value); }
  raw(values) { for (const value of values) this.byte(value); }
  string(value) {
    const encoded = new TextEncoder().encode(value);
    this.short(encoded.length);
    this.raw(encoded);
  }
  named(type, name) { this.byte(type); this.string(name); }
  namedString(name, value) { this.named(TAG.STRING, name); this.string(value); }
  namedShort(name, value) { this.named(TAG.SHORT, name); this.short(value); }
  namedInt(name, value) { this.named(TAG.INT, name); this.int(value); }
  namedByteArray(name, values) {
    this.named(TAG.BYTE_ARRAY, name);
    this.int(values.length);
    this.raw(values);
  }
  endCompound() { this.byte(0); }
  finish() { return new Uint8Array(this.bytes); }
}

function encodeVarInt(value) {
  const bytes = [];
  let remaining = value >>> 0;
  do {
    let next = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) next |= 0x80;
    bytes.push(next);
  } while (remaining !== 0);
  return bytes;
}

function normalizeBlocks(blocks, palette, materials) {
  if (!Array.isArray(blocks) || !Array.isArray(materials) || materials.length === 0) {
    throw new Error("Voxelization has not produced a block grid yet.");
  }

  const placed = blocks.map((block, index) => {
    const entry = palette[materials[index]];
    if (!entry) throw new Error(`Missing palette entry for block ${index}.`);
    return { id: `minecraft:${entry[0]}`, x: block[3], y: block[4], z: block[5] };
  });

  if (placed.length === 0) throw new Error("The voxel grid is empty.");

  const minX = Math.min(...placed.map((block) => block.x));
  const minY = Math.min(...placed.map((block) => block.y));
  const minZ = Math.min(...placed.map((block) => block.z));
  const maxX = Math.max(...placed.map((block) => block.x));
  const maxY = Math.max(...placed.map((block) => block.y));
  const maxZ = Math.max(...placed.map((block) => block.z));
  const cells = placed.map((block) => ({ ...block, x: block.x - minX, y: block.y - minY, z: block.z - minZ }));

  return { width: maxX - minX + 1, height: maxY - minY + 1, length: maxZ - minZ + 1, cells };
}

function createEngineGrid(blocks, palette, materials) {
  const grid = normalizeBlocks(blocks, palette, materials);
  const paletteStates = [{ id: "minecraft:air" }];
  const paletteIndex = new Map([["minecraft:air", 0]]);
  const cells = grid.cells.map((cell) => {
    if (!paletteIndex.has(cell.id)) {
      paletteIndex.set(cell.id, paletteStates.length);
      paletteStates.push({ id: cell.id });
    }
    return { x: cell.x, y: cell.y, z: cell.z, block: { id: cell.id }, source: "voxelartcraft" };
  });
  return { version: 1, width: grid.width, height: grid.height, length: grid.length, cells, palette: paletteStates, coordinateSystem: "xyz", origin: { x: 0, y: 0, z: 0 } };
}
function createGridExport(blocks, palette, materials) {
  const grid = normalizeBlocks(blocks, palette, materials);
  return { version: 1, source: "voxelartcraft", ...grid };
}

function createSchematicBytes(blocks, palette, materials) {
  const grid = normalizeBlocks(blocks, palette, materials);
  const paletteIds = ["minecraft:air"];
  const paletteIndex = new Map([["minecraft:air", 0]]);

  for (const cell of grid.cells) {
    if (!paletteIndex.has(cell.id)) {
      paletteIndex.set(cell.id, paletteIds.length);
      paletteIds.push(cell.id);
    }
  }

  const byPosition = new Map(grid.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell]));
  const blockData = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let z = 0; z < grid.length; z += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const cell = byPosition.get(`${x},${y},${z}`);
        blockData.push(...encodeVarInt(cell ? paletteIndex.get(cell.id) : 0));
      }
    }
  }

  const writer = new NbtWriter();
  writer.byte(TAG.COMPOUND);
  writer.string("");
  writer.namedInt("Version", 2);
  writer.namedInt("DataVersion", 3105);
  writer.namedShort("Width", grid.width);
  writer.namedShort("Height", grid.height);
  writer.namedShort("Length", grid.length);
  writer.named(TAG.COMPOUND, "Palette");
  for (let index = 0; index < paletteIds.length; index += 1) writer.namedInt(paletteIds[index], index);
  writer.endCompound();
  writer.namedByteArray("BlockData", blockData);
  writer.named(TAG.LIST, "BlockEntities");
  writer.byte(TAG.COMPOUND);
  writer.int(0);
  writer.named(TAG.COMPOUND, "Metadata");
  writer.namedString("Name", "CraftAIB Voxel Art");
  writer.namedString("Author", "CraftAIB");
  writer.namedString("WorldEditVersion", "7.3.0");
  writer.endCompound();
  writer.endCompound();
  return writer.finish();
}

async function gzip(bytes) {
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function createSchematicFile(blocks, palette, materials) {
  return new File([await gzip(createSchematicBytes(blocks, palette, materials))], "craftaib.schem", { type: "application/gzip" });
}

function createGridFile(blocks, palette, materials) {
  return new File([JSON.stringify(createGridExport(blocks, palette, materials), null, 2)], "craftaib-block-grid.json", { type: "application/json" });
}

export { createEngineGrid, createGridExport, createGridFile, createSchematicFile };

