# Staged change map

This map groups the current uncommitted work into reviewable stages. No commit is created by this document.

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

`test:vision-live` is explicitly skipped unless a real endpoint is configured.
