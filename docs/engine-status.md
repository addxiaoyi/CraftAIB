# Engine implementation status

This is the current acceptance index. `architecture.md` describes the active React/Worker/server
boundaries; `capability-matrix.md` retains upstream provenance and historical milestones.

Verified on Windows with Node.js 26.9.0 and Linux with Node.js 24.22.2 on 2026-11-04:
`npm run verify` exited 0, including 10 browser suites and 8 tooling tests. Detailed evidence
and remaining acceptance boundaries are recorded in `project-goals.md` and `acceptance-2026-11-04.md`.

## Implemented paths

- Shared BlockGrid/SceneGraph, exact block-state palettes, validation, material counts, edits,
  undo/redo, scene composition, checkpoints and project helpers.
- Image/pixel-art and map-art adapters, structure generation, AI planning and BuilderGPT mode.
- Schematic and Litematic import/export; named regions, signed region dimensions, origins,
  properties, Litematic entities/block entities/ticks and malformed-input rejection.
- Browser Worker tasks and Node CLI operations, PNG projections, GLB and HTML viewer exports.
- React workspaces, resource-pack rendering, material replacement, placements and portable
  project downloads with storage recovery.
- LEGO/LDraw and geospatial adapters with offline fixtures and explicit external-resource errors.

## Data-integrity acceptance

| Requirement | Repeatable evidence |
| --- | --- |
| Preserve two states of the same block ID through adapters | `structure-boundary-smoke.mjs` |
| Preserve Litematic NBT, origins and region-local positions | `structure-boundary-smoke.mjs`, `litematica-smoke.mjs` |
| Reject malformed NBT, duplicate region names and mismatched dimensions | `structure-boundary-smoke.mjs` |
| Invalid edits leave undo/redo intact; fill uses indexed cells | `structure-boundary-smoke.mjs` |
| Edited exports use current blocks and preserve named regions | `frontend-structure-regression.mjs`, `export-edit-browser-smoke.mjs` |
| Rotate/mirror coordinates, states and NBT consistently | `frontend-structure-regression.mjs` |
| Merge 400,000 blocks without spread-argument stack overflow | `frontend-structure-regression.mjs` |
| Validate JSON before replacing a project; preserve NBT JSON values | `project-state-regression.mjs`, `project-state-browser-smoke.mjs` |
| Preserve NBT longs and bytes through CLI JSON and checkpoints | `cli-smoke.mjs`, `project-state-regression.mjs` |
| Recover denied/corrupt/full storage and honor autosave opt-out | `project-state-regression.mjs`, `project-state-browser-smoke.mjs` |
| Deliver the current Worker and reject false server readiness | `tooling-smoke.mjs`, `browser-suite.mjs` |
| Resolve Builder block models and bundled atlas references | `npm run test:textures` (offline) |
| Import/export native placement origin arrays and wrapped subregions | `litematica-smoke.mjs`, `npm run acceptance:client` |
| Bound model-authored code and keep it outside the Node host | `builder-sandbox-smoke.mjs`, `server-smoke.mjs` |

## Commands

```powershell
npm run test:all
npm run build:ui
npm run test:browser
# All three, in dependency order:
npm run verify
```

Browser installation: `npm run setup:browser`. An existing compatible browser may be selected
with `CRAFTAIB_CHROMIUM_PATH`. The verification suite starts its own isolated fixture server.

## Separate acceptance boundaries

- Deterministic local previews and mocked AI contract tests do not prove a real model's quality.
  `npm run test:vision-live` requires a configured endpoint and creates evidence under
  `outputs/vision-live`.
- Java Litematica Easy Place, verifier and client rendering are outside this web engine.
  Exported files still need Minecraft-client acceptance for the intended game version.
- Linux verification ran in an isolated Debian Bookworm Docker container with clean source,
  committed vendor baselines and Linux dependencies. A hosted Codespace was not launched.
- Local builds and tests are not a commit, GitHub publication, deployment, or service restart.
