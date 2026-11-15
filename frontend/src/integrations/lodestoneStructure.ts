import { BlockState, type StructureProvider } from '@mattzh72/lodestone';
import type { StructureData } from '../types/minecraft';
import { vanillaBlockStates } from './vanillaBlockStates.ts';

export function createLodestoneProvider(structure: StructureData): StructureProvider {
  const placed = structure.blocks.map((block) => {
    const id = block.blockId.includes(':') ? block.blockId : `minecraft:${block.blockId}`;
    const modelId = id === 'minecraft:grass' ? 'minecraft:short_grass' : id;
    // Minecraft supplies omitted properties; previewing an imported palette must do the same.
    const state = { ...vanillaBlockStates[modelId], ...block.state };
    return { pos: [block.x, block.y, block.z] as [number, number, number], state: new BlockState(modelId, state) };
  });
  const byPosition = new Map(placed.map((block) => [block.pos.join(','), block]));
  return {
    getSize: () => [structure.size.x, structure.size.y, structure.size.z],
    getBlocks: () => placed,
    getBlock: (pos) => byPosition.get(pos.join(',')) ?? null,
  };
}
