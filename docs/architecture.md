# CraftAIB integration architecture

## Product boundary

CraftAIB owns orchestration and user-facing integration. It does not fork or silently rewrite upstream implementations.

```text
image upload
    |
    v
ImageInput -> PaletteSelection -> BlockGrid
                              |          |
                              v          v
                       Cartographer   Craftmatic
                     map-art outputs  schem/render/view
                              \          /
                               v        v
                              Export / Material report
```

## Responsibilities

### Voxelartcraft adapter

Use Voxelartcraft for image preprocessing, palette matching, dithering, and its existing NBT-oriented browser flow. The adapter must normalize its output into a versioned `BlockGrid` instead of passing DOM state between applications.

### Cartographer adapter

Use Cartographer's generation package for map-art block placement, palette balancing, staircasing, and Litematica/JSON/NBT transforms. Keep worker execution isolated from the UI.

### Craftmatic adapter

Use Craftmatic for Sponge `.schem` parsing/writing, 2D/3D rendering, and interactive viewing. It is the canonical renderer for schematic artifacts.

## Initial contract

```ts
export type BlockCell = {
  id: string;
  properties?: Record<string, string>;
  x: number;
  y: number;
  z: number;
};

export type BlockGrid = {
  version: 1;
  width: number;
  height: number;
  depth: number;
  cells: BlockCell[];
  source: 'image' | 'schematic' | 'generated';
};
```

Adapters should validate dimensions and coordinates at the boundary. Exporters must return a typed error rather than silently dropping unsupported blocks or formats.

## Why submodules

The three upstream repositories have different build systems and release cadences. Submodules keep upstream provenance and license boundaries visible, allow pinned reproducible builds, and avoid copying generated assets into CraftAIB. Integration code should live in CraftAIB-owned packages, not in `vendor/`.
