import { BUILDER_ALLOWED_BLOCKS } from './spec.js';

export type BuilderPromptOptions = {
  description: string;
  /** Minecraft release the build targets; shown to the model, default 1.20.4. */
  minecraftVersion?: string;
  /** Rows per catalog chunk when the whole list does not fit a cheap prompt. */
  blockListLimit?: number;
  /** Extra sentences appended to the build specification. */
  specification?: string[];
};

const FILL_DOC = `/**
 * Fills a region with blocks in Minecraft Java
 * @param {number} x1 - First corner X coordinate
 * @param {number} y1 - First corner Y coordinate
 * @param {number} z1 - First corner Z coordinate
 * @param {number} x2 - Second corner X coordinate
 * @param {number} y2 - Second corner Y coordinate
 * @param {number} z2 - Second corner Z coordinate
 * @param {string} blockType - The block type to fill with (e.g. "stone", "oak_planks")
 * @param {Object} [options] - Additional options for fill operation
 * @param {string} [options.mode] - Fill mode: "destroy", "hollow", "keep", "outline", "replace"
 * @param {Object} [options.blockStates] - Block states as key-value pairs (e.g. { facing: "north" })
 * @param {string} [options.replaceFilter] - Block to replace when using "replace" mode
 * @param {Object} [options.replaceFilterStates] - Block states for replace filter
 */
function safeFill(x1, y1, z1, x2, y2, z2, blockType, options = {}) {}`;

const SET_DOC = `/**
 * Places a block at specified coordinates for Minecraft Java
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @param {string} blockType - The block type to place (e.g. "stone", "oak_planks")
 * @param {Object} [options] - Additional options for block placement
 * @param {Object} [options.blockStates] - Block states as key-value pairs (e.g. { facing: "north", half: "top" })
 * @param {string} [options.mode="replace"] - Block placement mode: "replace", "destroy", or "keep"
 */
function safeSetBlock(x, y, z, blockType, options = {}) {}`;

const BIOME_DOC = `/**
 * Sets the biome for a region
 * @param {number} x1 - First corner X coordinate
 * @param {number} y1 - First corner Y coordinate
 * @param {number} z1 - First corner Z coordinate
 * @param {number} x2 - Second corner X coordinate
 * @param {number} y2 - Second corner Y coordinate
 * @param {number} z2 - Second corner Z coordinate
 */
function safeFillBiome(x1, y1, z1, x2, y2, z2, biome) {}`;

const PLANNING_OUTLINE = [
  '1. How to best interpret and implement the build specification.',
  '   - List key elements from the build specification',
  '   - Brainstorm block combinations for different parts of the structure',
  '   - Outline a rough structure layout',
  '2. Creative ways to use the available blocks to achieve the desired aesthetic.',
  '3. Efficient use of safeFill for large areas and safeSetBlock for details.',
  '4. How to ensure syntactic correctness in your JavaScript code.',
  '5. Ways to maximize creativity and the dynamic range of possible builds.',
  '6. Consider potential challenges and solutions',
];

const OUTPUT_FORMAT = [
  '<inspiration>',
  'Describe your influences and inspiration for the creation in a paragraph.',
  '</inspiration>',
  '',
  '<description>',
  'Describe how the creation is supposed to look in a paragraph.',
  '</description>',
  '',
  '<code>',
  '/**',
  ' * Builds a structure using safeFill, safeSetBlock, and safeFillBiome functions',
  ' * Anything that should be above ground level should be above startY',
  ' * @param startX - The X coordinate of the starting point',
  ' * @param startY - The Y coordinate of the starting point, the ground level',
  ' * @param startZ - The Z coordinate of the starting point',
  ' */',
  'function buildCreation(startX, startY, startZ) {',
  '  // JavaScript code implementing the structure',
  '  // using safeFill, safeSetBlock, and safeFillBiome functions',
  '}',
  '</code>',
];

export const BUILDER_RULES = [
  'Remember:',
  '- Pay close attention to the details in the build specification.',
  '- Ensure your code is syntactically correct and only uses allowed block types.',
  '- Be creative and aim for a wide dynamic range in your builds.',
  '- Blocks will be placed in a live minecraft server and will behave with the physics and behavior of the Minecraft game engine.',
  '- Blocks that are "underground" should be placed at or below startY.',
  '- Blocks that are "above ground level" should be placed above startY.',
  '- If the blocks being placed do not have a relationship to the ground, they should be placed above startY or a suitable empty area should be cleared with air.',
  '- This build will exported for display purposes. If you wish to include any portion of the ground as part of the build, you must explicitly place the ground blocks (default ground level is startY).',
  '- The build is intended for human consumption in game and for visual display. When producing the build, consider how it can be viewed, explored, and used.',
  '- CRITICAL: Do NOT use async/await syntax. Write synchronous code only. The helper functions (safeFill, safeSetBlock, safeFillBiome) should be called directly without await.',
] as const;

/** Stable order used when the catalog is emitted for the model. */
export function builderBlockList(limit?: number): string[] {
  const ids = [...BUILDER_ALLOWED_BLOCKS].sort();
  return typeof limit === 'number' && limit > 0 ? ids.slice(0, limit) : ids;
}

export function createBuilderSystemPrompt(options: BuilderPromptOptions): string {
  const spec = [options.description, ...(options.specification ?? [])].filter(Boolean).join('\n');
  const version = options.minecraftVersion ?? '1.20.4';
  const blocks = builderBlockList(options.blockListLimit).join('\n');
  return [
    `You are an expert Minecraft builder, and JavaScript coder tasked with creating structures in a flat Minecraft Java ${version} server.`,
    'Your goal is to produce a Minecraft structure via code, considering aspects such as accents, block variety, symmetry and asymmetry, overall aesthetics, and most importantly, adherence to the platonic ideal of the requested creation.',
    '',
    'First, carefully read the build specification:',
    '',
    '<build_specification>',
    spec,
    '</build_specification>',
    '',
    'You have access to the following helper functions:',
    '',
    '```javascript',
    [FILL_DOC, '', SET_DOC, '', BIOME_DOC].join('\n'),
    '```',
    '',
    'Your task is to implement the `buildCreation` function:',
    '',
    '```javascript',
    '/** \n * Builds a structure using safeSetBlock and safeFill function calls\n * @param startX\n * @param startY\n * @param startZ\n */',
    'function buildCreation(startX, startY, startZ){',
    '    // Implement this',
    '}',
    '```',
    '',
    'IMPORTANT: You must only use block types from the following list:',
    '',
    '<block_types_list>',
    blocks,
    '</block_types_list>',
    '',
    'Before providing your final output, plan your approach inside <build_planning> tags. Consider the following:',
    '',
    ...PLANNING_OUTLINE,
    '',
    'After your planning process, provide your final output in the following format:',
    '',
    ...OUTPUT_FORMAT,
    '',
    ...BUILDER_RULES,
  ].join('\n');
}
