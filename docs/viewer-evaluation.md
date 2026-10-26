# Viewer Evaluation

Checked 2026-10-26 from the upstream repositories and their current manifests.

## Decision

Keep CraftAIB's existing `ThreeViewport` and BlockGrid boundary for editing. Lodestone is now available as an opt-in `Lodestone models` renderer in the 3D Viewer. It uses the bundled MIT default pack, real blockstate/model definitions, emissive flags, and asynchronous 16-block chunk meshing. The native renderer remains available for Alt block inspection, region editing, placement transforms, and export callbacks.

## Candidates

| Project | License | Useful capability | Integration cost | Decision |
| --- | --- | --- | --- | --- |
| `mattzh72/lodestone` 0.6.0 | MIT | TypeScript/Three.js, Litematic support, default resource pack, block-state renderer | Medium: adapted through `LodestoneViewport` and a BlockGrid provider | Integrated as opt-in model renderer |
| `EndingCredits/litematic-viewer` | Not declared in the shallow checkout | DeepSlate upload/layer/material viewer | High: old architecture; README documents broken multi-region behavior | Do not use as the core |
| `EngineHub/SchematicWebViewer` 5.0.1 | MIT | Modern schematic renderer and resource-pack hooks | Medium-high: expects complete resource packs and SchematicJS data | Useful for `.schem`, not the current Litematic-first path |
| `Schem-at/schematic-renderer` 1.6.1 | AGPL-3.0-only | Rust/WASM meshing, workers, resource packs, large structures | High: WASM build/runtime and copyleft distribution boundary | Do not bundle without a license decision |

## Texture boundary

The native Viewer uses vanilla 1.21.4 block textures from `assets.mcasset.cloud` through a CORS-aware fetch/cache. The Lodestone mode uses the bundled default pack under `frontend/public/lodestone-default-pack`, including blockstates, models, atlas and block flags. Missing native texture files fall back to the existing material color without passing an undefined `map` to Three.js.

Lodestone mode also accepts a standard Minecraft resource-pack ZIP from the Viewer toolbar. Blockstates and models are merged over the bundled pack; block textures are packed into a generated atlas and override matching vanilla textures. Hold `Alt` and move over the canvas to ray-pick a block; the selected BlockGrid cell is sent to the existing Inspector. The native renderer remains the authoritative editing surface when model geometry cannot be mapped back to a single voxel.

This is a representative block-face renderer, not a complete Minecraft model renderer. Doors, panes, stairs and redstone components still need model/state geometry if exact client appearance is required.

## Large structures

The current preview keeps a bounded surface sample for very large structures, groups blocks by 16x16x16 render chunks, and yields between chunk mesh insertions. This keeps the UI responsive while preserving the full BlockGrid for export and material counts. It does not discard blocks from Litematic/Schematic export.
