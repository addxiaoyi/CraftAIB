// BuilderGPT-compatible vanilla block ID catalog, mirrored from CyniaAI/BuilderGPT
// block_id_list.txt (Apache-2.0). IDs are stored bare; the minecraft: namespace is
// restored when a builder specification is parsed.
export const BUILDERGPT_BLOCK_IDS = [
  "air", "stone", "granite", "polished_granite", "diorite", "polished_diorite", "andesite",
  "polished_andesite", "grass_block", "dirt", "coarse_dirt", "podzol", "cobblestone",
  "oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks",
  "dark_oak_planks", "mangrove_planks", "crimson_planks", "warped_planks", "bamboo_planks",
  "oak_sapling", "spruce_sapling", "birch_sapling", "jungle_sapling", "acacia_sapling",
  "dark_oak_sapling", "mangrove_propagule", "bedrock", "sand", "red_sand", "gravel",
  "gold_ore", "deepslate_gold_ore", "iron_ore", "deepslate_iron_ore", "coal_ore",
  "deepslate_coal_ore", "nether_gold_ore", "oak_log", "spruce_log", "birch_log", "jungle_log",
  "acacia_log", "dark_oak_log", "mangrove_log", "crimson_stem", "warped_stem", "bamboo_block",
  "oak_leaves", "spruce_leaves", "birch_leaves", "jungle_leaves", "acacia_leaves",
  "dark_oak_leaves", "mangrove_leaves", "azalea_leaves", "flowering_azalea_leaves", "sponge",
  "wet_sponge", "glass", "tinted_glass", "lapis_ore", "deepslate_lapis_ore", "lapis_block",
  "dispenser", "sandstone", "chiseled_sandstone", "cut_sandstone", "note_block", "white_bed",
  "orange_bed", "magenta_bed", "light_blue_bed", "yellow_bed", "lime_bed", "pink_bed",
  "gray_bed", "light_gray_bed", "cyan_bed", "purple_bed", "blue_bed", "brown_bed", "green_bed",
  "red_bed", "black_bed", "powered_rail", "detector_rail", "sticky_piston", "cobweb", "grass",
  "fern", "dead_bush", "seagrass", "tall_seagrass", "sea_pickle", "piston", "white_wool",
  "orange_wool", "magenta_wool", "light_blue_wool", "yellow_wool", "lime_wool", "pink_wool",
  "gray_wool", "light_gray_wool", "cyan_wool", "purple_wool", "blue_wool", "brown_wool",
  "green_wool", "red_wool", "black_wool", "moving_piston", "dandelion", "poppy", "blue_orchid",
  "allium", "azure_bluet", "red_tulip", "orange_tulip", "white_tulip", "pink_tulip",
  "oxeye_daisy", "cornflower", "lily_of_the_valley", "wither_rose", "spore_blossom",
  "brown_mushroom", "red_mushroom", "crimson_fungus", "warped_fungus", "crimson_roots",
  "warped_roots", "nether_sprouts", "weeping_vines", "twisting_vines", "sugar_cane", "kelp",
  "moss_carpet", "moss_block", "flowering_azalea", "azalea", "hay_block", "terracotta",
  "white_terracotta", "orange_terracotta", "magenta_terracotta", "light_blue_terracotta",
  "yellow_terracotta", "lime_terracotta", "pink_terracotta", "gray_terracotta",
  "light_gray_terracotta", "cyan_terracotta", "purple_terracotta", "blue_terracotta",
  "brown_terracotta", "green_terracotta", "red_terracotta", "black_terracotta", "barrel",
  "smoker", "blast_furnace", "cartography_table", "fletching_table", "grindstone", "lectern",
  "loom", "smithing_table", "stonecutter", "bell", "lantern", "soul_lantern", "campfire",
  "soul_campfire", "shroomlight", "bee_nest", "beehive", "honey_block", "honeycomb_block",
  "lodestone", "crying_obsidian", "respawn_anchor", "ancient_debris", "netherite_block",
  "blackstone", "blackstone_slab", "blackstone_stairs", "gilded_blackstone",
  "polished_blackstone", "polished_blackstone_slab", "polished_blackstone_stairs",
  "chiseled_polished_blackstone", "polished_blackstone_bricks",
  "polished_blackstone_brick_slab", "polished_blackstone_brick_stairs",
  "cracked_polished_blackstone_bricks", "soul_soil", "budding_amethyst", "amethyst_block",
  "amethyst_cluster", "small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud",
  "calcite", "tuff", "deepslate", "cobbled_deepslate", "polished_deepslate",
  "deepslate_bricks", "cracked_deepslate_bricks", "deepslate_tiles", "cracked_deepslate_tiles",
  "chiseled_deepslate", "infested_deepslate", "cobbled_deepslate_stairs",
  "cobbled_deepslate_slab", "cobbled_deepslate_wall", "polished_deepslate_stairs",
  "polished_deepslate_slab", "polished_deepslate_wall", "deepslate_brick_stairs",
  "deepslate_brick_slab", "deepslate_brick_wall", "deepslate_tile_stairs",
  "deepslate_tile_slab", "deepslate_tile_wall", "chiseled_bookshelf", "bamboo_mosaic",
  "bamboo_mosaic_slab", "bamboo_mosaic_stairs",
] as const;

/** The upstream list repeats a few entries; the catalog it stands for is the unique set. */
export const BUILDER_BLOCK_NAMES: readonly string[] = [...new Set<string>(BUILDERGPT_BLOCK_IDS)].sort();
export const BUILDERGPT_BLOCK_COUNT = BUILDER_BLOCK_NAMES.length;

export type BuilderBlockEntry = {
  /** Namespaced ID the build script is told to write. */
  id: string;
  /** Bare ID, as it appears in BuilderGPT's block_id_list.txt. */
  name: string;
  category: string;
};

const CATALOG_CATEGORIES: Array<[string, string]> = [
  ['concrete_powder', 'concrete powder'],
  ['stained_glass', 'stained glass'],
  ['glazed_terracotta', 'glazed terracotta'],
  ['terracotta', 'terracotta'],
  ['shulker_box', 'storage'],
  ['copper', 'copper'],
  ['deepslate', 'deepslate'],
  ['prismarine', 'prismarine'],
  ['sandstone', 'sandstone'],
  ['basalt', 'basalt'],
  ['quartz', 'quartz'],
  ['brick', 'brick'],
  ['wool', 'wool'],
  ['glass', 'glass'],
  ['planks', 'planks'],
  ['trapdoor', 'trapdoor'],
  ['log', 'log'],
  ['wood', 'wood'],
  ['stairs', 'stairs'],
  ['slab', 'slab'],
  ['fence_gate', 'fence gate'],
  ['fence', 'fence'],
  ['wall', 'wall'],
  ['pane', 'pane'],
  ['door', 'door'],
  ['sapling', 'plant'],
  ['carpet', 'carpet'],
  ['ore', 'ore'],
  ['tile', 'tile'],
];

/** Best-effort category inferred from the ID, used only by the block lookup. */
export function builderBlockCategory(name: string): string {
  return CATALOG_CATEGORIES.find(([needle]) => name.includes(needle))?.[1] ?? 'block';
}

export const BUILDER_BLOCK_DIRECTORY: BuilderBlockEntry[] = BUILDER_BLOCK_NAMES.map((name) => ({
  id: `minecraft:${name}`,
  name,
  category: builderBlockCategory(name),
}));

/**
 * BuilderGPT's `get_minecraft_blocks` lookup. The model asks with a query word savior and
 * a match mode of `any`, `start` or a category name; unmatched queries return nothing, so
 * a hallucinated block name never reaches the build path.
 */
export function get_minecraft_blocks(query: string, match = 'any'): BuilderBlockEntry[] {
  const needle = String(query ?? '').toLowerCase();
  const mode = String(match ?? 'any').toLowerCase();
  if (!needle) return [];
  return BUILDER_BLOCK_DIRECTORY.filter((entry) => {
    if (mode === 'start' || mode === 'prefix') return entry.name.startsWith(needle) || entry.id.startsWith(needle);
    if (mode === 'any' || mode === 'contains') return entry.name.includes(needle) || entry.id.includes(needle);
    if (mode === 'exact') return entry.name === needle || entry.id === needle;
    return entry.category === mode;
  });
}
