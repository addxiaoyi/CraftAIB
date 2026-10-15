import { StructureData } from '../types/minecraft';

export function createDefaultStructure(): StructureData {
  const sx = 16;
  const sy = 28;
  const sz = 16;
  const blocks: Array<{ x: number; y: number; z: number; blockId: string }> = [];

  // Foundation Y=0
  for (let x = 0; x < sx; x++) {
    for (let z = 0; z < sz; z++) {
      const isEdge = x === 0 || x === sx - 1 || z === 0 || z === sz - 1;
      blocks.push({
        x,
        y: 0,
        z,
        blockId: isEdge ? 'minecraft:polished_deepslate' : 'minecraft:deepslate_bricks',
      });
    }
  }

  // Tower walls Y=1 to 20
  for (let y = 1; y < 20; y++) {
    for (let x = 0; x < sx; x++) {
      for (let z = 0; z < sz; z++) {
        const isCorner = (x === 0 || x === sx - 1) && (z === 0 || z === sz - 1);
        const isWall = x === 0 || x === sx - 1 || z === 0 || z === sz - 1;

        if (isCorner) {
          // Corner columns
          blocks.push({ x, y, z, blockId: 'minecraft:obsidian' });
        } else if (isWall) {
          // Arched windows
          const isWindowY = (y >= 4 && y <= 7) || (y >= 12 && y <= 15);
          const isMidX = x === 7 || x === 8;
          const isMidZ = z === 7 || z === 8;

          // Doorway
          if (z === 0 && (x === 7 || x === 8) && y <= 3) {
            continue;
          }

          if (isWindowY && (isMidX || isMidZ)) {
            blocks.push({ x, y, z, blockId: 'minecraft:tinted_glass' });
          } else {
            blocks.push({
              x,
              y,
              z,
              blockId: (x + y + z) % 11 === 0 ? 'minecraft:crying_obsidian' : 'minecraft:deepslate_bricks',
            });
          }
        }
      }
    }
  }

  // Intermediate floor balconies
  for (let x = 1; x < sx - 1; x++) {
    for (let z = 1; z < sz - 1; z++) {
      if ((x + z) % 3 === 0) {
        blocks.push({ x, y: 10, z, blockId: 'minecraft:spruce_planks' });
      }
    }
  }

  // Battlements & Overhang Y=20 to 22
  for (let x = 0; x < sx; x++) {
    for (let z = 0; z < sz; z++) {
      const isWall = x === 0 || x === sx - 1 || z === 0 || z === sz - 1;
      if (isWall) {
        // crenellations
        if ((x + z) % 2 === 0) {
          blocks.push({ x, y: 20, z, blockId: 'minecraft:deepslate_tiles' });
          blocks.push({ x, y: 21, z, blockId: 'minecraft:polished_deepslate' });
        } else {
          blocks.push({ x, y: 20, z, blockId: 'minecraft:deepslate_tiles' });
        }
      }
    }
  }

  // Spire Roof Y=22 to 27
  let inset = 2;
  for (let y = 22; y < 27; y++) {
    for (let x = inset; x < sx - inset; x++) {
      for (let z = inset; z < sz - inset; z++) {
        const isEdge =
          x === inset || x === sx - inset - 1 || z === inset || z === sz - inset - 1;
        if (isEdge || y === 26) {
          blocks.push({ x, y, z, blockId: 'minecraft:oxidized_copper' });
        }
      }
    }
    inset++;
  }

  // Beacon Lanterns
  blocks.push({ x: 7, y: 27, z: 7, blockId: 'minecraft:lantern' });
  blocks.push({ x: 8, y: 27, z: 8, blockId: 'minecraft:sea_lantern' });
  blocks.push({ x: 1, y: 21, z: 1, blockId: 'minecraft:lantern' });
  blocks.push({ x: sx - 2, y: 21, z: 1, blockId: 'minecraft:lantern' });
  blocks.push({ x: 1, y: 21, z: sz - 2, blockId: 'minecraft:lantern' });
  blocks.push({ x: sx - 2, y: 21, z: sz - 2, blockId: 'minecraft:lantern' });

  return {
    id: 'struct_default_watchtower',
    name: 'Gothic Obsidian Watchtower',
    description: 'High-density obsidian fortress tower with lancet stained windows, oxidized copper roof, and crying obsidian runes.',
    author: 'BlockCraft Master Studio',
    version: '1.20.4',
    size: { x: sx, y: sy, z: sz },
    regions: [
      {
        id: 'reg_foundation',
        name: 'Foundation & Crypt',
        bounds: { min: [0, 0, 0], max: [sx, 1, sz] },
        locked: false,
        visible: true,
        color: '#10B981',
      },
      {
        id: 'reg_great_hall',
        name: 'Great Hall & Arches',
        bounds: { min: [0, 1, 0], max: [sx, 11, sz] },
        locked: false,
        visible: true,
        color: '#3B82F6',
      },
      {
        id: 'reg_upper_tower',
        name: 'Upper Chamber & Battlements',
        bounds: { min: [0, 11, 0], max: [sx, 22, sz] },
        locked: false,
        visible: true,
        color: '#8B5CF6',
      },
      {
        id: 'reg_spire',
        name: 'Oxidized Copper Spire',
        bounds: { min: [0, 22, 0], max: [sx, sy, sz] },
        locked: false,
        visible: true,
        color: '#F59E0B',
      },
    ],
    blocks,
  };
}
