import { BlockMeta } from '../types/minecraft';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

export const BLOCK_REGISTRY: Record<string, BlockMeta> = {
  // Stone & Deepslate
  'minecraft:deepslate_bricks': {
    id: 'minecraft:deepslate_bricks',
    name: 'Deepslate Bricks',
    color: '#343438',
    rgb: hexToRgb('#343438'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:polished_deepslate': {
    id: 'minecraft:polished_deepslate',
    name: 'Polished Deepslate',
    color: '#47474c',
    rgb: hexToRgb('#47474c'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:deepslate_tiles': {
    id: 'minecraft:deepslate_tiles',
    name: 'Deepslate Tiles',
    color: '#28282c',
    rgb: hexToRgb('#28282c'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:stone_bricks': {
    id: 'minecraft:stone_bricks',
    name: 'Stone Bricks',
    color: '#7b7b7b',
    rgb: hexToRgb('#7b7b7b'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:mossy_stone_bricks': {
    id: 'minecraft:mossy_stone_bricks',
    name: 'Mossy Stone Bricks',
    color: '#6e7d63',
    rgb: hexToRgb('#6e7d63'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:cracked_stone_bricks': {
    id: 'minecraft:cracked_stone_bricks',
    name: 'Cracked Stone Bricks',
    color: '#717171',
    rgb: hexToRgb('#717171'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:chiseled_stone_bricks': {
    id: 'minecraft:chiseled_stone_bricks',
    name: 'Chiseled Stone Bricks',
    color: '#656565',
    rgb: hexToRgb('#656565'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:smooth_stone': {
    id: 'minecraft:smooth_stone',
    name: 'Smooth Stone',
    color: '#9e9e9e',
    rgb: hexToRgb('#9e9e9e'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:cobblestone': {
    id: 'minecraft:cobblestone',
    name: 'Cobblestone',
    color: '#696969',
    rgb: hexToRgb('#696969'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:calcite': {
    id: 'minecraft:calcite',
    name: 'Calcite',
    color: '#dfdad0',
    rgb: hexToRgb('#dfdad0'),
    category: 'stone',
    blastResistance: 3,
  },
  'minecraft:tuff': {
    id: 'minecraft:tuff',
    name: 'Tuff',
    color: '#6a6860',
    rgb: hexToRgb('#6a6860'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:polished_andesite': {
    id: 'minecraft:polished_andesite',
    name: 'Polished Andesite',
    color: '#848485',
    rgb: hexToRgb('#848485'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:polished_diorite': {
    id: 'minecraft:polished_diorite',
    name: 'Polished Diorite',
    color: '#b9b9bb',
    rgb: hexToRgb('#b9b9bb'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:polished_granite': {
    id: 'minecraft:polished_granite',
    name: 'Polished Granite',
    color: '#956453',
    rgb: hexToRgb('#956453'),
    category: 'stone',
    blastResistance: 6,
  },
  'minecraft:obsidian': {
    id: 'minecraft:obsidian',
    name: 'Obsidian',
    color: '#151024',
    rgb: hexToRgb('#151024'),
    category: 'mineral',
    blastResistance: 1200,
  },
  'minecraft:crying_obsidian': {
    id: 'minecraft:crying_obsidian',
    name: 'Crying Obsidian',
    color: '#321448',
    rgb: hexToRgb('#321448'),
    category: 'mineral',
    blastResistance: 1200,
  },

  // Wood & Foliage
  'minecraft:oak_planks': {
    id: 'minecraft:oak_planks',
    name: 'Oak Planks',
    color: '#a88752',
    rgb: hexToRgb('#a88752'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:spruce_planks': {
    id: 'minecraft:spruce_planks',
    name: 'Spruce Planks',
    color: '#725433',
    rgb: hexToRgb('#725433'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:spruce_log': {
    id: 'minecraft:spruce_log',
    name: 'Spruce Log',
    color: '#46321d',
    rgb: hexToRgb('#46321d'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:dark_oak_planks': {
    id: 'minecraft:dark_oak_planks',
    name: 'Dark Oak Planks',
    color: '#422a16',
    rgb: hexToRgb('#422a16'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:birch_planks': {
    id: 'minecraft:birch_planks',
    name: 'Birch Planks',
    color: '#c2b17a',
    rgb: hexToRgb('#c2b17a'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:cherry_planks': {
    id: 'minecraft:cherry_planks',
    name: 'Cherry Planks',
    color: '#e4aeb0',
    rgb: hexToRgb('#e4aeb0'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:mangrove_planks': {
    id: 'minecraft:mangrove_planks',
    name: 'Mangrove Planks',
    color: '#763631',
    rgb: hexToRgb('#763631'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:bamboo_planks': {
    id: 'minecraft:bamboo_planks',
    name: 'Bamboo Planks',
    color: '#c2b34a',
    rgb: hexToRgb('#c2b34a'),
    category: 'wood',
    flammable: true,
  },
  'minecraft:crimson_planks': {
    id: 'minecraft:crimson_planks',
    name: 'Crimson Planks',
    color: '#653043',
    rgb: hexToRgb('#653043'),
    category: 'wood',
  },
  'minecraft:warped_planks': {
    id: 'minecraft:warped_planks',
    name: 'Warped Planks',
    color: '#2b6865',
    rgb: hexToRgb('#2b6865'),
    category: 'wood',
  },

  // Concrete & Terracotta
  'minecraft:white_concrete': {
    id: 'minecraft:white_concrete',
    name: 'White Concrete',
    color: '#cfd5d6',
    rgb: hexToRgb('#cfd5d6'),
    category: 'colored',
  },
  'minecraft:orange_concrete': {
    id: 'minecraft:orange_concrete',
    name: 'Orange Concrete',
    color: '#e06100',
    rgb: hexToRgb('#e06100'),
    category: 'colored',
  },
  'minecraft:magenta_concrete': {
    id: 'minecraft:magenta_concrete',
    name: 'Magenta Concrete',
    color: '#a9309f',
    rgb: hexToRgb('#a9309f'),
    category: 'colored',
  },
  'minecraft:light_blue_concrete': {
    id: 'minecraft:light_blue_concrete',
    name: 'Light Blue Concrete',
    color: '#2389c6',
    rgb: hexToRgb('#2389c6'),
    category: 'colored',
  },
  'minecraft:yellow_concrete': {
    id: 'minecraft:yellow_concrete',
    name: 'Yellow Concrete',
    color: '#f0af15',
    rgb: hexToRgb('#f0af15'),
    category: 'colored',
  },
  'minecraft:lime_concrete': {
    id: 'minecraft:lime_concrete',
    name: 'Lime Concrete',
    color: '#5ea818',
    rgb: hexToRgb('#5ea818'),
    category: 'colored',
  },
  'minecraft:pink_concrete': {
    id: 'minecraft:pink_concrete',
    name: 'Pink Concrete',
    color: '#d5658e',
    rgb: hexToRgb('#d5658e'),
    category: 'colored',
  },
  'minecraft:gray_concrete': {
    id: 'minecraft:gray_concrete',
    name: 'Gray Concrete',
    color: '#36393d',
    rgb: hexToRgb('#36393d'),
    category: 'colored',
  },
  'minecraft:light_gray_concrete': {
    id: 'minecraft:light_gray_concrete',
    name: 'Light Gray Concrete',
    color: '#7d7d73',
    rgb: hexToRgb('#7d7d73'),
    category: 'colored',
  },
  'minecraft:cyan_concrete': {
    id: 'minecraft:cyan_concrete',
    name: 'Cyan Concrete',
    color: '#157788',
    rgb: hexToRgb('#157788'),
    category: 'colored',
  },
  'minecraft:purple_concrete': {
    id: 'minecraft:purple_concrete',
    name: 'Purple Concrete',
    color: '#641f9c',
    rgb: hexToRgb('#641f9c'),
    category: 'colored',
  },
  'minecraft:blue_concrete': {
    id: 'minecraft:blue_concrete',
    name: 'Blue Concrete',
    color: '#2c2e8f',
    rgb: hexToRgb('#2c2e8f'),
    category: 'colored',
  },
  'minecraft:brown_concrete': {
    id: 'minecraft:brown_concrete',
    name: 'Brown Concrete',
    color: '#603b1f',
    rgb: hexToRgb('#603b1f'),
    category: 'colored',
  },
  'minecraft:green_concrete': {
    id: 'minecraft:green_concrete',
    name: 'Green Concrete',
    color: '#495b24',
    rgb: hexToRgb('#495b24'),
    category: 'colored',
  },
  'minecraft:red_concrete': {
    id: 'minecraft:red_concrete',
    name: 'Red Concrete',
    color: '#8e2020',
    rgb: hexToRgb('#8e2020'),
    category: 'colored',
  },
  'minecraft:black_concrete': {
    id: 'minecraft:black_concrete',
    name: 'Black Concrete',
    color: '#141519',
    rgb: hexToRgb('#141519'),
    category: 'colored',
  },

  // Terracotta
  'minecraft:terracotta': {
    id: 'minecraft:terracotta',
    name: 'Terracotta',
    color: '#985e44',
    rgb: hexToRgb('#985e44'),
    category: 'stone',
  },
  'minecraft:white_terracotta': {
    id: 'minecraft:white_terracotta',
    name: 'White Terracotta',
    color: '#d1b2a1',
    rgb: hexToRgb('#d1b2a1'),
    category: 'stone',
  },
  'minecraft:cyan_terracotta': {
    id: 'minecraft:cyan_terracotta',
    name: 'Cyan Terracotta',
    color: '#575b5b',
    rgb: hexToRgb('#575b5b'),
    category: 'stone',
  },

  // Glass & Utility & Light
  'minecraft:glass': {
    id: 'minecraft:glass',
    name: 'Glass',
    color: '#c2e3e5',
    rgb: hexToRgb('#c2e3e5'),
    category: 'glass',
  },
  'minecraft:tinted_glass': {
    id: 'minecraft:tinted_glass',
    name: 'Tinted Glass',
    color: '#342a38',
    rgb: hexToRgb('#342a38'),
    category: 'glass',
  },
  'minecraft:lantern': {
    id: 'minecraft:lantern',
    name: 'Lantern',
    color: '#f3c467',
    rgb: hexToRgb('#f3c467'),
    category: 'utility',
  },
  'minecraft:sea_lantern': {
    id: 'minecraft:sea_lantern',
    name: 'Sea Lantern',
    color: '#a7d5cb',
    rgb: hexToRgb('#a7d5cb'),
    category: 'utility',
  },
  'minecraft:glowstone': {
    id: 'minecraft:glowstone',
    name: 'Glowstone',
    color: '#bc8e44',
    rgb: hexToRgb('#bc8e44'),
    category: 'utility',
  },
  'minecraft:shroomlight': {
    id: 'minecraft:shroomlight',
    name: 'Shroomlight',
    color: '#e78a48',
    rgb: hexToRgb('#e78a48'),
    category: 'utility',
  },

  // Precious & Metals
  'minecraft:gold_block': {
    id: 'minecraft:gold_block',
    name: 'Gold Block',
    color: '#f5d13b',
    rgb: hexToRgb('#f5d13b'),
    category: 'mineral',
  },
  'minecraft:iron_block': {
    id: 'minecraft:iron_block',
    name: 'Iron Block',
    color: '#dedede',
    rgb: hexToRgb('#dedede'),
    category: 'mineral',
  },
  'minecraft:copper_block': {
    id: 'minecraft:copper_block',
    name: 'Copper Block',
    color: '#c06c50',
    rgb: hexToRgb('#c06c50'),
    category: 'mineral',
  },
  'minecraft:oxidized_copper': {
    id: 'minecraft:oxidized_copper',
    name: 'Oxidized Copper',
    color: '#53a285',
    rgb: hexToRgb('#53a285'),
    category: 'mineral',
  },
  'minecraft:diamond_block': {
    id: 'minecraft:diamond_block',
    name: 'Diamond Block',
    color: '#62ebd7',
    rgb: hexToRgb('#62ebd7'),
    category: 'mineral',
  },
  'minecraft:emerald_block': {
    id: 'minecraft:emerald_block',
    name: 'Emerald Block',
    color: '#17dd62',
    rgb: hexToRgb('#17dd62'),
    category: 'mineral',
  },
  'minecraft:netherite_block': {
    id: 'minecraft:netherite_block',
    name: 'Netherite Block',
    color: '#423d3f',
    rgb: hexToRgb('#423d3f'),
    category: 'mineral',
  },

  // Organic & Landscape
  'minecraft:grass_block': {
    id: 'minecraft:grass_block',
    name: 'Grass Block',
    color: '#5b8e32',
    rgb: hexToRgb('#5b8e32'),
    category: 'organic',
  },
  'minecraft:dirt': {
    id: 'minecraft:dirt',
    name: 'Dirt',
    color: '#866043',
    rgb: hexToRgb('#866043'),
    category: 'organic',
  },
  'minecraft:sand': {
    id: 'minecraft:sand',
    name: 'Sand',
    color: '#dbd3a0',
    rgb: hexToRgb('#dbd3a0'),
    category: 'organic',
  },
  'minecraft:water': {
    id: 'minecraft:water',
    name: 'Water',
    color: '#2e5b9e',
    rgb: hexToRgb('#2e5b9e'),
    category: 'organic',
  },
  'minecraft:moss_block': {
    id: 'minecraft:moss_block',
    name: 'Moss Block',
    color: '#596e2d',
    rgb: hexToRgb('#596e2d'),
    category: 'organic',
  },
};

// Common architectural substitution graph
export const BLOCK_SUBSTITUTIONS: Record<string, string[]> = {
  'minecraft:deepslate_bricks': ['minecraft:stone_bricks', 'minecraft:polished_deepslate', 'minecraft:tuff'],
  'minecraft:crying_obsidian': ['minecraft:obsidian', 'minecraft:deepslate_tiles', 'minecraft:black_concrete'],
  'minecraft:calcite': ['minecraft:polished_diorite', 'minecraft:white_concrete', 'minecraft:smooth_stone'],
  'minecraft:spruce_planks': ['minecraft:dark_oak_planks', 'minecraft:oak_planks', 'minecraft:birch_planks'],
  'minecraft:oxidized_copper': ['minecraft:prismarine', 'minecraft:cyan_concrete', 'minecraft:warped_planks'],
  'minecraft:emerald_block': ['minecraft:green_concrete', 'minecraft:moss_block', 'minecraft:lime_concrete'],
  'minecraft:diamond_block': ['minecraft:light_blue_concrete', 'minecraft:cyan_concrete'],
  'minecraft:netherite_block': ['minecraft:polished_deepslate', 'minecraft:black_concrete', 'minecraft:obsidian'],
};

// Helper: Find closest block by RGB Euclidean distance
export function findClosestBlock(
  r: number,
  g: number,
  b: number,
  allowedPalette?: string[]
): BlockMeta {
  let closest: BlockMeta = BLOCK_REGISTRY['minecraft:stone_bricks'];
  let minDistance = Infinity;

  const entries = Object.values(BLOCK_REGISTRY).filter((meta) => {
    if (!allowedPalette || allowedPalette.length === 0) return true;
    return allowedPalette.includes(meta.id);
  });

  for (const block of entries) {
    const dr = block.rgb[0] - r;
    const dg = block.rgb[1] - g;
    const db = block.rgb[2] - b;
    const dist = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (dist < minDistance) {
      minDistance = dist;
      closest = block;
    }
  }

  return closest;
}
