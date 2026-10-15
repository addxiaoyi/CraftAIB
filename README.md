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
npm run build:browser-worker
```

The engine test also rebuilds the browser Worker with the native Windows esbuild binary through `scripts/build-browser-worker.ps1`; this avoids the Windows Node child-process `spawn EPERM` path. The direct build script is used for the new engine packages because upstream native postinstall scripts (`esbuild`, `sharp`, `workerd`) may be blocked by pnpm approval policy. Upstream builds remain available separately:

```powershell
pnpm build:craftmatic
pnpm build:cartographer
```

The new React workbench is the active frontend. The former Voxelartcraft-led HTML UI is kept only as legacy engine/test source and is not served by `npm start`:

```powershell
npm start
# http://127.0.0.1:4183
```

For hot reload, use `npm run dev`; it starts the API server and Vite frontend together. The imported frontend from `minecraft-architect-studio` lives under `frontend/` and keeps the 10-workspace information architecture, while structure parsing, Worker rendering, real projection encoding, materials, and AI planning are wired to the CraftAIB engine.

See `docs/license-distribution-audit.md` for the current distribution audit and `docs/staged-change-map.md` for the four review stages.

## License boundary

This is an internal integration workspace. Craftmatic is MIT, Cartographer is GPLv3, and the Voxelartcraft baseline carries an All Rights Reserved notice. The matrix records provenance and distribution risk; do not treat the current workspace as unrestricted commercial redistribution.

## Litematica-aware AI building

CraftAIB now models the important distinction in Litematica between the compressed `.litematic` schematic and the separate placement JSON used by the client:

- `parseLitematicaDocumentBytes` keeps metadata, named regions, negative region sizes, block-state properties, and entity/block-tick counts.
- `parseLitematicaPlacements` and `serializeLitematicaPlacements` handle placement position, rotation, mirror, enabled/locked state, coordinate locks, and sub-region settings.
- `structurePlanToRegionGrids` converts an AI `StructurePlan` into non-overlapping named regions such as `main`, `roof`, `courtyard`, and `tower`.
- `serializeLitematicaRegions` writes those regions with tight long-array block-state packing and Litematica-compatible metadata.

Example CLI flow:

```powershell
craftaib ai plan prompt.json plan.json
craftaib ai vision prompt.json plan.json
craftaib ai vision-litematic prompt.json building.litematic
craftaib ai litematic prompt.json building.litematic
craftaib litematic info building.litematic
```

The browser Worker exposes `litematic.inspect` and `ai.generate-litematic`. The Litematica Java runtime itself (Easy Place, verifier, client mixins, and schematic-world rendering) is not copied into the browser; CraftAIB implements the file and placement semantics at the adapter boundary.

To use a real reference-image vision model, set `CRAFTAIB_VISION_API_URL`, `CRAFTAIB_VISION_API_KEY`, and optionally `CRAFTAIB_VISION_MODEL`. The adapter sends an OpenAI-compatible multimodal request and validates the returned StructurePlan before any blocks are generated.
# AI building server

Run `npm start`; its prestart step builds the shared engine and browser Worker. The server serves the workspace and exposes `GET /api/ai/status` and `POST /api/ai/structure-plan` on the same origin. Copy `.env.example` to `.env` and configure the text and/or vision API URL and model; the API key is optional for trusted local endpoints. Credentials are never sent to the browser or saved in project files. Without a configured model, the workspace creates a clearly labeled local preview; AI request failures require an explicit choice to retry or use that preview.


See [`docs/frontend-api-contract.md`](docs/frontend-api-contract.md) for request/response schemas, limits, error codes, and the endpoints the frontend expects. No server-side project, materials, or export endpoints are needed.
