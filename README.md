# CraftAIB

CraftAIB is a unified Minecraft image, voxel, map-art, schematic, and scene engine. **Voxelartcraft remains the primary image-to-voxel experience**, while Craftmatic and Cartographer are connected through explicit TypeScript adapters and a shared scene model.

## Current implementation

The first engine foundation is now present:

- `docs/capability-matrix.md` — source-level inventory of the three pinned repositories, runtime boundaries, migration strategy, tests, and license flags.
- `packages/core` — `ImageSource`, `PixelMap`, `BlockState`, `BlockGrid`, `SceneGraph`, task events, validation, scene conversion, and material counting.
- `packages/voxelartcraft-adapter` — normalizes Voxelartcraft's runtime `blocks/palette/materials` arrays into `BlockGrid`.
- `packages/cartographer-adapter` — normalizes Map Art cells and exposes a single-layer pixel bridge.
- `packages/craftmatic-adapter` — normalizes schematic-like data into `BlockGrid` and `SceneGraph`.
- `packages/engine-worker` — shared browser Worker task protocol with progress, result, error, and cancellation-ready events.
- `packages/engine-cli` — initial Node CLI for validating grids and producing material reports.

The current step is intentionally an engine foundation, not a claim that every upstream feature has already been reimplemented behind one API.

## Pinned upstream baselines

```text
Voxelartcraft 708732579536d16c7d7762c01c499671ae7cc490
Craftmatic    59f76c889ab1f0efdf08adeffa7dfc78a6631ae2
Cartographer  784c1d90e5072cae118fcce82050fbe7737ed86f
```

## Engine model

```text
ImageSource -> PixelMap -> BlockGrid -> SceneGraph
                                  -> NBT / Schematic / Litematic / JSON
                                  -> PNG / GLB / HTML
```

The canonical grid uses zero-based `xyz` coordinates, a required `minecraft:air` palette entry, explicit dimensions, and normalized block IDs. Adapters validate bounds, duplicate coordinates, palette references, and malformed block IDs at the boundary.

## Development

Requirements: Node.js 22, pnpm 11, and Git.

```powershell
pnpm install --offline --ignore-scripts
node scripts/build-engine.mjs
node scripts/engine-smoke.mjs
pnpm matrix
```

The direct build script is used for the new engine packages because upstream native postinstall scripts (`esbuild`, `sharp`, `workerd`) may be blocked by pnpm approval policy. Upstream builds remain available separately:

```powershell
pnpm build:craftmatic
pnpm build:cartographer
```

The Voxelartcraft-led browser workbench remains available through the static server:

```powershell
python -m http.server 4182
```

## License boundary

This is an internal integration workspace. Craftmatic is MIT, Cartographer is GPLv3, and the Voxelartcraft baseline carries an All Rights Reserved notice. The matrix records provenance and distribution risk; do not treat the current workspace as unrestricted commercial redistribution.
