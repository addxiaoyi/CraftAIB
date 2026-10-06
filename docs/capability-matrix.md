# CraftAIB capability matrix

Baseline commits: `Voxelartcraft 708732579536d16c7d7762c01c499671ae7cc490`, `Craftmatic 59f76c889ab1f0efdf08adeffa7dfc78a6631ae2`, `Cartographer 784c1d90e5072cae118fcce82050fbe7737ed86f`.

This matrix is the implementation index. `Direct` means the capability can be wrapped without changing its algorithm; `Adapt` means it needs a CraftAIB model adapter; `Isolate` means it must remain a separately licensed/runtime boundary; `Rewrite` means no stable public implementation was found at the baseline.

| Domain | Capability | Source | Input / output | Runtime | Strategy | Verification |
|---|---|---|---|---|---|---|
| Image | Upload, resize, crop | Voxelartcraft `src/gui.js`; Cartographer `interface/components/image-selector.tsx` | Image → ImageSource/PixelMap | Browser | Adapt | Upload PNG/JPG/WebP, preserve aspect ratio |
| Image | Brightness, contrast, saturation, temperature, tint | Voxelartcraft `src/script.js` + shaders | PixelMap → PixelMap | Browser/Worker | Adapt | Pixel fixture comparisons |
| Palette | Block metadata and filters | Voxelartcraft `blockProperties.json`, `src/blockPalette.js` | Palette metadata → Palette | Browser/Node | Adapt | Stable IDs and selected-block count |
| Palette | Nearest color, correction, dithering | Cartographer `packages/pixels/src/conversion`, `transformers` | PixelMap + Palette → PixelMap | Browser/Node | Adapt | Cartographer fixture tests |
| Voxel | Perspective voxelization | Voxelartcraft `src/script.js`, `shaders/*.glsl` | PixelMap + VoxelOptions → BlockGrid | Browser/Worker | Isolate then adapt | Deterministic seed/size/material count |
| Voxel | Flat Pixel Art | Voxelartcraft `src/script.js` | PixelMap → 2D BlockGrid | Browser/Worker | Adapt | One-depth grid invariant |
| Map Art | Palette balancing and staircasing | Cartographer `packages/generation/src/block-generation` | PixelMap + MapArtOptions → BlockGrid | Browser/Node | Adapt | Block count and material balance |
| Export | Structure NBT | Voxelartcraft `src/schematic.js`; Cartographer `serialization/nbt.ts` | BlockGrid → NBT | Browser/Node | Adapt | Write/read round trip |
| Export | Sponge Schematic v2 | Craftmatic `src/schem`, current `src/exports.js` | BlockGrid ↔ Schematic | Browser/Node | Adapt | Parse/write round trip |
| Export | Litematica | Cartographer `packages/litematica`, `schema-generation/litematica` | BlockGrid → Litematic | Browser/Node | Adapt | Litematic fixture readback |
| Export | JSON | Cartographer `schema-generation`, current BlockGrid JSON | BlockGrid → JSON | Browser/Node | Direct | JSON schema validation |
| Structure | Procedural structures | Craftmatic `src/gen` | StructureOptions → SceneGraph/BlockGrid | Node/Worker | Adapt | All 10 types and 9 styles |
| Render | Floor, cutaway, exterior | Craftmatic `src/render` | BlockGrid → PNG | Node/Worker | Adapt | Golden image dimensions and non-empty output |
| Render | Three.js viewer | Craftmatic `web/src` and `src/convert/schem-to-three.ts` | SceneGraph → Three scene | Browser | Adapt | Browser smoke and camera controls |
| Render | GLB and HTML viewer | Craftmatic CLI/export modules | SceneGraph → GLB/HTML | Node | Adapt | File signature and standalone open |
| Scene | LEGO/LDraw models, parts, inventory | Craftmatic `web/src` public catalogs and worker routes | Catalog query → SceneGraph | Browser/Worker | Isolate | Catalog lookup and model load |
| Geo | OSM, tiles, terrain, vegetation | Craftmatic `src/convert`, `worker`, web routes | GeoSource → SceneGraph | Browser/Node | Isolate | Offline fixture + explicit network error |
| Runtime | CLI, batching, checkpoints | Craftmatic CLI/checkpoint modules | Task → artifact/event stream | Node | Adapt | Cancel/resume and stable exit codes |
| Runtime | Browser workers | Craftmatic workers + new CraftAIB worker protocol | EngineTask → EngineEvent | Browser | Adapt | Progress/result/error/cancel contract |

## License / distribution flags

- Voxelartcraft baseline contains an All Rights Reserved notice: keep source attribution and treat direct redistribution as restricted.
- Craftmatic is MIT: preserve its copyright and license notice.
- Cartographer is GPLv3: keep its adapter/source boundary explicit for internal integration; reassess before external distribution.
- This repository is currently an internal integration workspace, not a claim of unrestricted commercial redistribution.
