# Staged change map

This map groups the current uncommitted work into reviewable stages. No commit is created by this document.

## Data integrity and delivery completion (2026-11-04)

The active goal and acceptance boundaries are in `docs/project-goals.md`; the current runtime
description is in `docs/architecture.md`, and executable coverage is indexed by `docs/engine-status.md`.

- Core and adapters: exact-state palettes, SchematicLike state preservation, Litematic NBT/origin
  round trips, malformed-input checks, native mirror axes and atomic indexed grid edits.
- Frontend integration: current-block named-region exports, transforms and NBT coordinates,
  validated project import, bigint/byte JSON, storage recovery, export error handling and undo isolation.
- Shared JSON codec: browser projects, CLI JSON, engine projects and checkpoints retain NBT values.
- Delivery: engine/Worker staging before UI builds, stale artifact rejection, API proxy port alignment,
  cross-platform browser discovery and detached readiness with persistent logs.
- Regression scripts: `structure-boundary-smoke`, `frontend-structure-regression`,
  `project-state-regression`, `export-edit-browser-smoke`, `project-state-browser-smoke`,
  `tooling-smoke`, plus expanded CLI and Litematic cases. Offline texture checks are part of `test:all`.

Acceptance command: `npm run verify`. Live-model, game-client, Linux and deployed-runtime evidence
remain separate from these local checks. Existing unrelated changes and vendor work are preserved.

## Stage 1: AI planner and vision

- `packages/ai-planner/`
- `packages/engine-worker/src/runner.ts` AI tasks
- `packages/engine-cli/src/cli.ts` AI commands
- `scripts/vision-contract-smoke.mjs`
- `scripts/vision-live-smoke.mjs`
- `scripts/engine-smoke.mjs` vision contract

Review focus: schema validation, retry behavior, endpoint/API key handling, no credential persistence, deterministic seed and Region bounds.

## Stage 2: Litematica adapter

- `packages/cartographer-adapter/src/litematica.ts`
- `packages/craftmatic-adapter/src/litematic-parse.ts`
- `packages/craftmatic-adapter/src/litematica-placement.ts`
- `packages/craftmatic-adapter/src/parse.ts`
- `packages/craftmatic-adapter/src/index.ts`
- `docs/litematica-understanding.md`
- `scripts/litematica-smoke.mjs`
- `scripts/fixture-smoke.mjs` and generated fixtures

Review focus: Version 4 metadata, Region Position/Size, tight packing, negative sizes, block-state properties, entities, ticks, placement transforms, and round trips.

## Stage 3: Viewer and workbench

- `packages/craftmatic-adapter/src/textured-viewer.ts`
- `src/gui.js`
- `src/project-store.js`
- `index.html`
- `style/style.css`
- `src/app.js`
- `src/scene-store.js`

Review focus: region overlays, selection, hide/lock/rotate/mirror, undo/redo, project persistence, Viewer-to-workbench sync, and browser error handling.

## Stage 4: Build and verification

- `scripts/build-browser-worker.mjs`
- `scripts/build-browser-worker.ps1`
- `scripts/worker-smoke.mjs`
- `scripts/ui-contract-smoke.mjs`
- `scripts/ai-litematic-browser-smoke.mjs`
- `scripts/viewer-region-browser-smoke.mjs`
- `scripts/cli-smoke.mjs`
- `package.json`, `pnpm-lock.yaml`
- `docs/capability-matrix.md`, `README.md`

Verification commands:

```powershell
npm run test:all
npm run test:browser-ai
npm run test:viewer-regions
npm run test:vision-live
```

`test:vision-live` requires a running configured server and reports failures explicitly.
`test:model-live` starts an isolated server with at most two provider calls and a 185-second
request budget. The 2026-11-04 attempt failed provider authentication; it is not a quality pass.

## Stage 5: Layout skeleton and responsive navigation

- `frontend/src/layout/workspaces.ts`
- `frontend/src/components/layout/AppHeader.tsx`
- `frontend/src/components/layout/WorkspaceDrawer.tsx`
- `frontend/src/components/layout/PageWorkspace.tsx`
- `frontend/src/components/layout/SegmentedTabs.tsx`
- `frontend/src/App.tsx`
- `frontend/src/i18n.ts`
- `frontend/src/index.css`
- `frontend/src/components/workspaces/{Projections,Materials,PixelArt,MapArt,VoxelLab,GeoScene,LegoLdraw,Settings,AiBuilder,Viewer3d}View.tsx`
- `docs/layout-skeleton.md`
- `scripts/responsive-browser-smoke.mjs`
- `scripts/architect-ui-smoke.mjs`
- `scripts/ui-button-smoke.mjs`
- `scripts/ui-file-action-smoke.mjs`

Review focus: one navigation model shared by header, dropdown and drawer; menu keyboard
contract (focus entry, roving arrows, Escape returns focus); structure summary only from
`xl`; drawer contract below 1024px only; PageWorkspace owns the page scroll and title row;
split panes use the workspace width tokens; smoke scripts follow the new breakpoints
instead of the old 2xl one.

Verification commands:

```bash
npm run typecheck:ui
npm run build:ui
node scripts/responsive-browser-smoke.mjs
node scripts/architect-ui-smoke.mjs
node scripts/ai-generation-browser-smoke.mjs
node scripts/ui-button-smoke.mjs
node scripts/ui-file-action-smoke.mjs
```

## Stage 6: Less creative steering by default

- `frontend/src/components/workspaces/AiBuilderView.tsx` -- size and detail are sent only when the
  user locks them; explicit `Auto` tiles exist for both.
- `scripts/server.mjs` -- interior wording is a preference instead of a room/furniture quota; the
  detail level is phrased as an aim; the `detailLevel >= 4` interior audit no longer requires rooms,
  circulation or furniture, only that a declared interior contains voxels.
- `packages/ai-planner/src/vision.ts` -- the aesthetic skill is advisory and defers to the brief and
  reference image; `ensureLanternLightCore` no longer injects `generated-room`,
  `generated-stairs`, `generated-table`, `generated-chair` or `generated-lamp` parts, leaving the
  lantern light core (`generated-lantern-light-core`) as the only synthesized geometry. Its
  `summarizeInteriorVoxelization` now falls back to `room`/`circulation` parts when no room-named
  region exists, and the exported `lanternChamber` helper is shared by injection and audit.
- `scripts/ai-generation-browser-smoke.mjs` -- asserts unset size, floors and detail by default, and
  locks/unlocks a preset envelope and detail level through the UI.
- `docs/builder-gpt-parity.md`

Review focus: no hard dimensions, no `floors` and no `detailLevel` on a default request; explicit
selections still validate exactly; lantern, empty-grid and block-budget guards untouched. The
interior audit still runs only for an explicitly requested `detailLevel >= 4`, and now reads the
voxel grid -- a declared interior needs at least three occupied interior cells and must not be more
than 90% solid -- instead of room, circulation and furniture counts.

Verification commands:

```bash
npm run typecheck:ui
npm run build:ui
node scripts/ai-generation-browser-smoke.mjs
node scripts/server-smoke.mjs
```

## Stage 7: Typed preview geometry

- `packages/ai-planner/src/index.ts` -- `planBuilding` draws typed geometry parts with or without
  constraints, so the no-settings preview no longer falls through to the raster fallback; a brief
  naming no size above 48 blocks across first takes its envelope from the massing proportions. Gable,
  hip and mansard roofs now inset from the eaves course upward (the measured house roof is
  576 -> 528 -> 480 cells over three courses; the earlier prism was inverted). The tower shell stops
  one course short, its deck fills `height - 2` and the merlon crown sits at `height - 1`. Stair
  headroom is capped at `roofBase`, and the front door is drawn after the geometry parts so the shell
  cannot overwrite it.
- `scripts/engine-smoke.mjs` -- asserts the tower deck (`width * length` cells at `height - 2`), a
  hollow merlon ring at `height - 1`, the two door halves with `facing=south`, stair presence, a
  gable roof that narrows course by course, a massed footprint for a large constraint-free brief and
  the fallback gable profile (a narrowing top course).
- `scripts/vision-contract-smoke.mjs` -- the region-only reference fixture now sets
  `geometry: undefined` explicitly instead of relying on `planBuilding`'s old early return.
- `docs/builder-gpt-parity.md`

Review focus: a model-authored plan keeps its own geometry; these parts only describe the local
fallback. No rendered comparison was made -- the figures are cell counts and part lists.

Verification commands:

```bash
node scripts/engine-smoke.mjs
node scripts/vision-contract-smoke.mjs
node scripts/builder-smoke.mjs
node scripts/autonomous-planner-smoke.mjs
node scripts/server-smoke.mjs
npm run typecheck:ui
npm run build:ui
node scripts/browser-suite.mjs
```

## Stage 8: BuilderGPT generation path and textured preview

- `scripts/server.mjs` -- `/api/ai/structure-plan` gains `mode: 'builder'` for text-only requests
  with no reference image: it builds the `builderMessages` conversation, calls the configured model
  without tool offers, runs `builderFromReply`, and returns `{ ok, plan, grid, regions,
  generationLog }`. A reference image always keeps the vision/plan path.
- `packages/engine-worker/src/runner.ts` -- `ai.structure-plan` forwards `mode` and returns
  `{ plan, grid, regions, source: 'ai', generationLog }` from the streamed builder result instead of
  assuming `structurePlanToGrid`.
- `frontend/src/integrations/building.ts` -- sends `mode: 'builder'` only when a model is configured,
  no reference image is present and width, height and length are all unlocked; locked dimensions and
  images stay on the plan path.
- `scripts/server.mjs` -- adds a bounded repair turn (`CRAFTAIB_BUILDER_REPAIR_ATTEMPTS`, default 1)
  that sends the execution error back and asks for one corrected script, recorded as
  `builder_retry`; adds `CRAFTAIB_MODEL_THINKING` (`auto`/`low`/`off`) applied to the plan loop,
  builder request, connection probe and `/api/ai/config`.
- `packages/ai-planner/src/vision.ts` -- `VisionPlannerOptions.thinking` adds
  `{"thinking":{"type":"disabled"}}` or `reasoning_effort: "low"` to plan requests.
- `frontend/src/components/workspaces/SettingsView.tsx` -- exposes the thinking mode next to
  timeout/retries, saves it with the model config and shows it in the diagnostics list.
- `scripts/server-smoke.mjs` -- covers the builder wire contract: non-empty grid, single region,
  plan dimensions matching the grid, `builder_execute` and `grid_validation` log entries, a broken
  script repaired on the second reply (with the error echoed back), 422 on a reply without a code
  block, and `mode=builder` being ignored for a reference image.
- `frontend/src/components/workspaces/AiBuilderView.tsx` -- AI preview renders through
  `LodestoneViewport`, slices blocks by the Y range before rendering, and falls back to the solid
  `ThreeViewport` above 250,000 preview blocks.
- `frontend/src/components/LodestoneViewport.tsx` -- renders the bundled pack's block models, so
  faces use model UVs and transparent textures stay transparent; validates texture atlas rectangles
  and accepts a viewport background color. Pack resources are cached (bundled per origin, custom
  packs per `File`, failed loads evicted); slice changes swap the structure with
  `setStructure` instead of recreating the renderer, which only happens on a pack or envelope
  change; the camera survives recreation of the same envelope; mesh statistics are debounced.
- `frontend/src/components/workspaces/AiBuilderView.tsx` -- generating a new structure resets the
  Y slice to full height instead of leaving the previous cut in place.
- `scripts/ai-generation-browser-smoke.mjs` -- screenshots the textured preview canvas after a
  generated plan and asserts painted coverage plus quantized colour diversity, so a DOM-only
  preview cannot pass; then slices to half height and asserts the block count drops while the
  renderer instance (`data-lodestone-instance`) stays the same.
- `frontend/src/utils/blockAliases.ts` -- maps the legacy `grass` preview id to `short_grass`.
- `scripts/builder-texture-regression.mjs` -- resolves all 234 `BUILDER_BLOCK_NAMES`, their
  blockstate variants and multipart models, parent chains, texture references and atlas rectangles,
  plus the palettes of four default preview plans.
- `package.json` -- adds `test:builder-textures`.
- `packages/ai-planner/src/vision.ts` -- a repeated `build_voxel_structure` plan is rejected when
  it cannot improve the result, but reused (and then finalized) when the earlier build already
  passes the reference gates; three consecutive rejected builds return the closest built structure
  with its measured deficit instead of discarding every attempt. Reference-analysis arguments are
  sanitized (labels trimmed to their schema limits) before validation, and three invalid analyses
  fail with `REFERENCE_ANALYSIS_INVALID` instead of retrying `analyze_reference_image` until the
  client times out. Finalized image plans now carry `referenceValidation`, so the UI reports the
  measured silhouette instead of `-`.
- `frontend/src/integrations/building.ts` -- reference images longer than 1280px on either side
  are downscaled and re-encoded as WebP before upload, so a 4.7MB photo no longer pushes the
  vision request into a gateway timeout; the original file is still shown in the UI.
- `scripts/vision-contract-smoke.mjs` -- covers duplicate reuse, salvage after repeated failed
  builds, and keeps rejecting plans that never reach the voxel grid.
- `docs/builder-gpt-parity.md` -- documents builder mode, the textured preview and the measured
  coverage.

Review focus: the builder path must not swallow reference-image or locked-dimension requests, and
its result must keep `plan`, `grid` and `regions` consistent. The preview swap must stay structural
-- no guessed per-cube texture, no pack edits -- with the 250k solid fallback and the single `grass`
alias as the only compatibility shims. The regression script is structural too: 234/234 catalog ids
resolve, all eight unique palette ids resolve, and failures exit 1. Rendering is checked only as a
paint smoke -- measured 3,404 preview blocks over a 1150x948 canvas, opaque coverage 1.0 and 107
quantized colours; a half-height slice drops the mesh to 2,004 blocks without a new renderer --
not as a pixel-level texture comparison.

Verification commands:

```bash
node scripts/server-smoke.mjs
node scripts/vision-contract-smoke.mjs
node scripts/builder-smoke.mjs
node scripts/builder-texture-regression.mjs
npm run typecheck:ui
npm run build:ui
node scripts/browser-suite.mjs
```
