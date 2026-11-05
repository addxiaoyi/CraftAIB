import { BlockState, type StructureProvider } from '@mattzh72/lodestone';
import type { StructureData } from '../types/minecraft';

const uprightStates: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'minecraft:chain': { axis: 'y' },
  'minecraft:lightning_rod': { facing: 'up', powered: 'false' },
};

export function createLodestoneProvider(structure: StructureData): StructureProvider {
  const placed = structure.blocks.map((block) => {
    const id = block.blockId.includes(':') ? block.blockId : `minecraft:${block.blockId}`;
    const modelId = id === 'minecraft:grass' ? 'minecraft:short_grass' : id;
    // These models render nothing when imported structures omit their state.
    const state = { ...uprightStates[modelId], ...block.state };
    return { pos: [block.x, block.y, block.z] as [number, number, number], state: new BlockState(modelId, state) };
  });
  const byPosition = new Map(placed.map((block) => [block.pos.join(','), block]));
  return {
    getSize: () => [structure.size.x, structure.size.y, structure.size.z],
    getBlocks: () => placed,
    getBlock: (pos) => byPosition.get(pos.join(',')) ?? null,
  };
}
