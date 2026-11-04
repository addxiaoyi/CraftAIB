# CraftAIB

CraftAIB is a unified Minecraft image, voxel, map-art, schematic, and scene workbench.
The active application is the React frontend in `frontend/`, backed by a shared TypeScript
engine, browser Worker, Node CLI and same-origin AI server. Voxelartcraft, Craftmatic and
Cartographer capabilities are connected through explicit adapters.

## Project goal

Turn a prompt, reference image, image, or structure file into an editable Minecraft structure,
then inspect, transform, count materials, save and export it without losing block states,
regions, coordinates or supported metadata. The ten workspaces share one current structure.

See [`docs/project-goals.md`](docs/project-goals.md) for the acceptance scope,
[`docs/engine-status.md`](docs/engine-status.md) for regression coverage, and
[`docs/architecture.md`](docs/architecture.md) for the runtime boundaries.

Switching devices: read the [2026-11-05 handoff](docs/handoff-2026-11-05.md) for the branch, setup commands and remaining acceptance work.

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

Requirements: Node.js 24 or newer, pnpm 11, and Git. The server uses Node's built-in proxy support for configured upstream endpoints.

```powershell
git submodule update --init --recursive
pnpm install --frozen-lockfile --ignore-scripts
node scripts/build-engine.mjs
node scripts/engine-smoke.mjs
pnpm matrix
npm run build:browser-worker
```

The engine build also compiles the three Craftmatic runtime entries used by the adapters. It uses host-native esbuild on Windows and Linux, so a fresh checkout does not depend on ignored vendor build artifacts. The complete upstream builds remain available separately:

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

See `docs/license-distribution-audit.md` for the current distribution audit and `docs/staged-change-map.md` for the review stages.

## License boundary

This is an internal integration workspace. Craftmatic is MIT, Cartographer is GPLv3, and the Voxelartcraft baseline carries an All Rights Reserved notice. The matrix records provenance and distribution risk; do not treat the current workspace as unrestricted commercial redistribution.

## Litematica-aware AI building

CraftAIB now models the important distinction in Litematica between the compressed `.litematic` schematic and the separate placement JSON used by the client:

- `parseLitematicaDocumentBytes` keeps metadata, named regions, negative region sizes, block-state properties, and entity/block-tick counts.
- `parseLitematicaPlacements` and `serializeLitematicaPlacements` handle placement position, rotation, mirror, enabled/locked state, coordinate locks, and sub-region settings.
- `serializeNativeLitematicaPlacement` writes the native Litematica 1.20.1 placement format; the parser accepts native origin arrays and wrapped sub-regions as well as the internal format.
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

The 3D Viewer includes an opt-in `Lodestone models` renderer backed by Lodestone 0.6.0 and its MIT-licensed vanilla default pack. It renders Minecraft blockstates and model geometry for doors, stairs, slabs, panes and other non-cube blocks, with asynchronous 16-block chunk meshing. Switch back to `Native inspector` when Alt block inspection and direct voxel editing are needed.

In `Lodestone models` mode, use `Resource pack` to upload a standard Minecraft resource-pack ZIP. Its blockstates, models and block textures are merged over the bundled vanilla pack. Hold `Alt` while moving over the model to select the underlying Minecraft block and update the existing Inspector.

To use a real reference-image model, configure the shared `CRAFTAIB_MODEL_API_URL`, `CRAFTAIB_MODEL_API_KEY`, and `CRAFTAIB_MODEL` variables below. The adapter sends a compatible multimodal request and validates the returned StructurePlan before any blocks are generated.
# AI building server

Run `npm start`; its prestart step builds the shared engine and browser Worker. The server serves the workspace and exposes `GET /api/ai/status` and `POST /api/ai/structure-plan` on the same origin. Copy `.env.example` to `.env` and configure the shared model endpoint; the API key is optional for trusted local endpoints. Credentials are never sent to the browser or saved in project files. Without a configured model, the workspace creates a clearly labeled local preview; AI request failures require an explicit choice to retry or use that preview.


See [`docs/frontend-api-contract.md`](docs/frontend-api-contract.md) for request/response schemas, limits, error codes, and the endpoints the frontend expects. No server-side project, materials, or export endpoints are needed.

## Unified model configuration

Reference-image generation uses the same multimodal model as text generation. Configure only the shared server-side endpoint, model and key:

```text
CRAFTAIB_MODEL_API_URL=https://provider.example/v1/chat/completions
CRAFTAIB_MODEL_API_KEY=server-only-secret
CRAFTAIB_MODEL=your-tool-capable-vision-model
CRAFTAIB_MODEL_TIMEOUT_MS=300000
CRAFTAIB_MODEL_MAX_RETRIES=2
```

The endpoint must support image input and chat-completions tool calls. The construction loop requires `analyze_reference_image`, `build_voxel_structure`, `inspect_voxel_structure`, `review_reference_structure`, and `finish_structure` or a revision. A reference image remains attached on every turn; the model receives executed orthographic voxel previews before it can finalize. The reference-image plan path does not execute model-generated JavaScript. Unconstrained text prompts may use the separately bounded BuilderGPT script path; see `docs/builder-gpt-parity.md`.

The local server is available at `http://127.0.0.1:4183`. Check `GET /api/ai/status` before generating. `npm run test:vision-live` performs a real, bounded generation against the configured server and writes plans, event logs, orthographic review PNGs, Litematic/Schematic files and exact block-state round-trip reports under `outputs/vision-live`.

## Verification

```powershell
npm run test:all       # engine, server, data integrity, tooling and UI type checks
npm run build:ui
npm run test:browser   # isolated browser fixture server; no model requests
npm run test:renderer-loading # cold loading, renderer switching and failure recovery
npm run verify
npm run acceptance:client  # deterministic client package; does not launch Minecraft
npm run test:model-live    # real configured model, at most two calls, 185 seconds total
```

Server-side BuilderGPT replies execute in a fresh QuickJS WASM context with a 2-second execution
deadline and 64 MiB guest memory cap. Only the three block-recording helpers are exposed.
The synchronous engine helper without an evaluator is reserved for trusted local scripts.
See `docs/acceptance-2026-11-04.md` for Windows/Linux evidence, the client package and the recorded
provider authentication failure. Minecraft-client results and real generation quality remain pending.

## GitHub Codespaces

This repository includes a Codespaces configuration for the complete application. Open the repository in GitHub, choose **Code → Codespaces → Create codespace on main**, and wait for the post-create build to finish. Port `4183` is forwarded automatically and the browser opens the CraftAIB workspace.

For AI generation, add these as Codespaces/User Secrets before starting the server: `CRAFTAIB_MODEL_API_URL`, `CRAFTAIB_MODEL_API_KEY`, `CRAFTAIB_MODEL`, `CRAFTAIB_MODEL_TIMEOUT_MS`, and `CRAFTAIB_MODEL_MAX_RETRIES`. Secrets are injected into the Codespace environment and are not committed to GitHub. Without them, local preview, Viewer, Litematic import/export and editing still work, but AI generation is disabled.

The Codespaces image uses Linux Node.js. `npm run build:browser-worker` uses the host-native esbuild package, while the PowerShell script remains available for the existing Windows workflow.
