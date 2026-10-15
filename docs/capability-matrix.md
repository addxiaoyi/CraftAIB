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

## 2026-10-08 implementation additions

- Core render API now provides floor, cutaway, and exterior raster output; Worker tasks expose `render.floor`, `render.cutaway`, and `render.exterior`.
- Export pipeline now covers Schematic, Litematic, GLB, HTML Viewer, and PNG CLI rendering.
- LEGO adapter now covers catalog search, LDraw parsing, resource resolution/loading, scene metadata, part-dimension voxelization, rotation matrices, color mapping, and Worker tasks `lego.search`, `lego.parse`, `lego.load`, `lego.scene`, `lego.blockgrid`, `lego.scene-grid`, and `lego.colors`.
- Geo adapter now covers roads, GeoJSON lines/polygons/points, OSM-like tag mapping, elevation/levels, vegetation, POIs, GeoProjection, and Worker tasks `geo.geojson`, `geo.blockgrid`, and `geo.poi`.
- Scene composition now includes `mergeGrids`, `mergeScenes`, and Worker task `scene.merge`.
- CLI now exposes validation, materials, unified export, PNG rendering, Map Art, GeoJSON, LEGO, Grid merge, and Craftmatic structure generation commands. `structure.generate` is available in the Worker and the CLI; it builds the pinned Craftmatic submodule before engine package checks.

## 2026-10-08 verified continuation

- Browser structure fallback: packages/craftmatic-adapter/src/structure.ts exports generateBrowserStructure for Worker-safe generation of all ten structure types when the Craftmatic Node generator cannot be imported. Each output is deduplicated by x,y,z and passed through createGrid/validateGrid. Verified by scripts/engine-smoke.mjs.
- Textured Viewer state: packages/craftmatic-adapter/src/textured-viewer.ts exports gridToViewerData and viewerDataToGrid; Viewer edits remove cells from the serialized block list, rebuild meshes, preserve BlockState properties and origin, and emit craftaib.viewer.changed. Verified by scripts/worker-smoke.mjs assertions.
- Project restore guard: src/script.js defers applyProcessing() while the default image texture or processed pixel buffer is unavailable. Browser reload verification no longer reports the previous byteLength restore failure; remaining WebGL warnings are legacy shader/framebuffer compatibility warnings.
- Browser integration contract: scripts/ui-contract-smoke.mjs checks the embedded Viewer host, cache-busted frontend modules, Viewer change protocol, locked-layer guard, structured ViewerData, deletion semantics, and absence of drawBuffers calls. Run with npm run test:ui.
- Binary fixture round trips: fixtures/smoke.schem and fixtures/smoke.litematic are generated from a property-bearing BlockGrid and verified by scripts/fixture-smoke.mjs, including dimensions, cell count, and oak_log axis state. Included in npm run test:engine.
- Parser error handling: Schematic BlockData varint decoding now fails explicitly on truncated input instead of silently padding missing cells; fixture smoke covers malformed gzip rejection.
- Litematic region handling: parser now discovers all region compounds, applies Position offsets, computes a normalized bounding BlockGrid, and rejects missing/truncated region data. Covered by the smoke fixture and malformed-input test.
- Two-region Litematic fixture: fixtures/smoke-two-regions.litematic contains independent Region compounds at Position x=-2 and x=1; fixture-smoke verifies normalized width 4 and merged cells at x=0 and x=3.
- CLI smoke: scripts/cli-smoke.mjs executes the built structure generate command, validates JSON output, and is included in npm run test:engine.
- CLI render smoke: CLI smoke now verifies exterior, floor, and cutaway PNG exports and checks the PNG signature for each output.
- CLI workflow smoke: scripts/cli-smoke.mjs now covers checkpoint save/load, batch schem/litematic/glb/html exports, scene merge, and render/material commands.
- CLI batch workflow smoke: validates manifest-driven Schematic batch export in addition to direct export, checkpoint, merge, material, and render commands.
- Browser import contract: ui-contract-smoke now asserts Litematic/Schematic worker routes update preview/material state and report successful import status.
- CLI schematic surface: schematic info and schematic convert now parse Schematic/Litematic input, report dimensions/materials, and convert to JSON/Schematic/Litematic; covered by CLI smoke.
- CLI schematic info/convert smoke covers both Schematic and Litematic input, plus JSON and Litematic conversion outputs.
- Fixture regeneration: fixtures:generate now deterministically rebuilds binary and JSON fixtures from the current adapters; test:all aliases the complete engine/CLI/browser contract suite.
- Latest browser runtime verification: cache-busted page 20261009-2 loaded both module copies and produced no WebGL warnings or errors in the latest Playwright console capture; only normal voxelizer/image-load logs were emitted.
- Frontend bootstrap: src/app.js is now the single browser module entrypoint, preventing duplicate execution from script.js/gui.js circular imports while preserving the Viewer and Worker integration contract.
- App bootstrap runtime evidence: the cache-busted app.js entrypoint now produces exactly one voxelizer start and one image-load log in Playwright, with no WebGL warnings/errors.
- Single-entry frontend contract: UI smoke now rejects direct script.js/gui.js tags and requires app.js as the only application module entrypoint, guarding against duplicate voxelizer initialization.
- Deterministic fixture generation: running fixtures:generate twice produces identical fixture hashes before test:all.


## Litematica semantic model

- `packages/craftmatic-adapter/src/litematic-parse.ts` now exposes document-level metadata, named regions, negative region sizes, tight long-array decoding, and region summaries.
- `packages/cartographer-adapter/src/litematica.ts` writes direct named `Regions` entries, keeps block-state properties, and uses tight packing; legacy wrapped-region input remains readable.
- `packages/craftmatic-adapter/src/litematica-placement.ts` models the separate Litematica placement JSON and applies position, rotation, mirror, and common block-state orientation changes.
- The upstream Litematica runtime is not copied into CraftAIB; Java client rendering, Easy Place, verifier, and mixins remain outside the browser/Node engine boundary.
- AI planner semantics: `@craftaib/ai-planner` validates named StructurePlan regions, allocates overlapping component volumes deterministically with later specific regions taking precedence, and exports default Litematica schematic Version 4.
- NBT numeric coverage: the shared Reader now handles float/double tags needed by entity `Pos` lists; `litematica-smoke.mjs` covers tight palette widths, negative region sizes, placement transforms, and double lists.

- Vision planner: `packages/ai-planner/src/vision.ts` accepts an OpenAI-compatible multimodal endpoint, requests JSON-only Litematica-aware `StructurePlan`, validates regions/palette/bounds, and feeds the existing BlockGrid/Litematic pipeline. No provider key or endpoint is stored in the repository.
- Viewer region overlays: `createTexturedHtmlViewer` accepts region/placement overlays and renders colored Region bounding boxes plus placement metadata; the workbench passes imported Litematic metadata into the Viewer.
- Browser AI Litematic E2E: `scripts/ai-litematic-browser-smoke.mjs` validates four generated named regions, materials, placement JSON import, and absence of browser errors/request failures.
