# CraftAIB integration architecture

## Active application

The React workbench in `frontend/` is the application served by `scripts/server.mjs` from `dist/`.
It has ten workspaces: AI Builder, Viewer, Projections, Materials, Pixel Art, Map Art, Voxel Lab,
Geo Scene, LEGO/LDraw, and Settings. The root Voxelartcraft HTML/JavaScript remains legacy
integration/reference code; it is not the production application entrypoint.

```text
React workspace -> typed frontend integration -> browser Worker -> shared engine/adapters
AI Builder      -> same-origin API server     -> configured model -> validated grid/plan
Shared grid     -> current editable structure -> named-region export -> downloaded artifact
```

`frontend/src/App.tsx` owns the current structure, project preferences, inventory, placements,
and persisted undo history. Workspaces commit structures through that shared owner.
`frontend/src/integrations/engine.ts` creates a Worker per task, propagates progress/errors,
and terminates the Worker on completion, cancellation, timeout, or message failure.
The server owns provider credentials. They are never part of project files or browser state.

## Canonical model and adapters

`packages/core/src/types.ts` defines the canonical `BlockGrid`: version 1, positive integer
width/height/length, zero-based cells, a complete block-state palette including air, `xyz`
coordinates, and an explicit world origin. A state is identified by its normalized ID plus
sorted properties; two orientations of one block ID are separate palette entries.
`validateGrid` rejects duplicate cells, invalid states, out-of-range coordinates, unsafe sizes,
missing exact palette states, and invalid origins.

- `voxelartcraft-adapter`: image/voxel normalization.
- `cartographer-adapter` and `waxmapart-adapter`: map-art generation and Litematic serialization.
- `craftmatic-adapter`: structure generation, Schematic/Litematic parsing, renders, viewers,
  GLB, LEGO/LDraw and geospatial conversion.
- `ai-planner`: local previews, typed plans, reference-image planning, and BuilderGPT geometry.
- `engine-worker`: common task registry and browser task routing.
- `engine-cli`: Node commands over the same engine packages.

The pinned upstream repositories and licensing boundaries remain documented in
`capability-matrix.md` and `license-distribution-audit.md`. Adapters do not imply that every
upstream runtime or algorithm has been ported to the browser.

## Editing and file semantics

`StructureData` carries the current editable blocks, bounds, regions, optional origin and NBT
metadata. An AI plan is generation provenance; downloads are derived from current blocks.
Rotations and mirrors transform coordinates, region bounds, directional block properties,
and supported NBT positions/yaw together. Editing invalidates an obsolete generation plan.

Litematic exports split the current grid into disjoint named regions with compact occupied
bounds. Each block belongs to one region, duplicate display names get unique export names,
and unassigned blocks/entities get a fallback region. World positions include the origin.
The serializer rejects duplicate region names or dimensions inconsistent with their grids.

Litematic import flattens region-local NBT coordinates into grid-local metadata. Export rebases
metadata into its chosen region. Numeric NBT types, compound/list contents, byte arrays, longs,
entities, block entities and pending block ticks are retained. The separate placement JSON
models client placement configuration; it is not part of the schematic block array.

## Persistence and failures

External project/structure JSON is validated before any React state is replaced. Restoration
uses the same validation and exposes a recovery warning when browser storage is denied,
corrupt, or full. JSON encoding preserves NBT bigint and byte-array values with explicit tags.
Downloadable `.craftaib.json` files remain the portable full project snapshot.

Browser persistence writes changed state slices only. Optional history and reference-image
storage can be released to let the current structure fit. Failed exports show an error and can
be retried; success is shown only after encoding and download initiation complete.

## Build and acceptance

`npm run build:ui` builds the engine and its required Craftmatic runtime entries, bundles the Worker, stages it into `frontend/public`, and
builds React. Browser verification rejects missing or unequal Worker copies in bundle, public
and `dist`. `npm run dev` builds engine/Worker dependencies first and keeps the Vite API proxy
aligned with `CRAFTAIB_API_PORT` (or the explicit `CRAFTAIB_API_TARGET`).

`npm run start:detached` requires built artifacts. It reports readiness only after its own
server responds with API status, HTML and Worker JavaScript; startup failures preserve a log
under `outputs/server` and return a nonzero exit code.

`npm run verify` runs engine/CLI/server/structure/project/tooling checks, UI typechecking,
a fresh production build and the isolated browser suite. Fixture tests make no live model
requests. Server-side BuilderGPT replies use a fresh QuickJS context with a 2-second deadline,
64 MiB guest memory cap and no exposed filesystem/network/process capabilities. The direct
synchronous builder helper is for trusted scripts unless an isolated evaluator is supplied.
Live model quality, Minecraft client placement, Linux/Codespaces runtime and
production deployment require their own evidence; see `project-goals.md`.
