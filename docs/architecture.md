# CraftAIB integration architecture

## Primary application

Voxelartcraft remains the user-facing application and owns the complete image-to-voxel path:

```text
image upload -> image processing -> palette selection -> WebGL voxelization
             -> material list -> preview -> export
```

CraftAIB adds downstream export capabilities to the existing flow instead of replacing its UI or duplicating its voxelizer.

## Functional fusion

```text
Voxelartcraft blocks + palette + materials
                    |
                    +--> structure.nbt (existing export)
                    +--> Sponge Schematic v2 (.schem) -> Craftmatic parser / renderer / viewer
                    +--> BlockGrid JSON -> Cartographer-compatible integration boundary
```

`src/exports.js` converts the existing Voxelartcraft runtime arrays into a normalized representation. It validates palette references and computes a zero-based bounding box before any format is written.

### BlockGrid contract

```ts
export type BlockCell = {
  id: string;
  x: number;
  y: number;
  z: number;
};

export type BlockGrid = {
  version: 1;
  source: 'voxelartcraft';
  width: number;
  height: number;
  length: number;
  cells: BlockCell[];
};
```

The JSON bridge is intentionally simple: Cartographer or a future CraftAIB worker can map the cells into its palette and Litematica serializers without depending on Voxelartcraft's DOM or private module state.

## Upstream boundaries

- `vendor/voxelartcraft` is the original upstream reference and is not the runtime source after its browser files are copied to the project root.
- `vendor/craftmatic` remains the downstream schematic/rendering implementation and source of truth for future viewer embedding.
- `vendor/cartographer` remains the downstream map-art/Litematica implementation and source of truth for future map-art export.

Future work should add explicit adapters around these contracts. It should not copy UI state between the three applications or parse generated HTML.
