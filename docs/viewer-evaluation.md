# Viewer Evaluation

Checked 2026-10-26 from the upstream repositories and their current manifests.

## Decision

Keep CraftAIB's existing `ThreeViewport` and BlockGrid boundary. Add the low-risk parts of Lodestone's approach locally: a cached Minecraft texture loader, explicit 16-block render chunks, progressive mesh insertion, and the existing Y-layer slice. A full renderer replacement would also replace CraftAIB's region editing, Alt block inspection, placement transforms, and export callbacks.

## Candidates

| Project | License | Useful capability | Integration cost | Decision |
| --- | --- | --- | --- | --- |
| `mattzh72/lodestone` 0.6.0 | MIT | TypeScript/Three.js, Litematic support, default resource pack, block-state renderer | Medium: adapt `Structure`/`BlockState` and preserve CraftAIB controls | Best reference and possible later dependency |
| `EndingCredits/litematic-viewer` | Not declared in the shallow checkout | DeepSlate upload/layer/material viewer | High: old architecture; README documents broken multi-region behavior | Do not use as the core |
| `EngineHub/SchematicWebViewer` 5.0.1 | MIT | Modern schematic renderer and resource-pack hooks | Medium-high: expects complete resource packs and SchematicJS data | Useful for `.schem`, not the current Litematic-first path |
| `Schem-at/schematic-renderer` 1.6.1 | AGPL-3.0-only | Rust/WASM meshing, workers, resource packs, large structures | High: WASM build/runtime and copyleft distribution boundary | Do not bundle without a license decision |

## Texture boundary

The Viewer uses vanilla 1.21.4 block textures from `assets.mcasset.cloud` through a CORS-aware fetch/cache. Missing texture files fall back to the existing material color without passing an undefined `map` to Three.js. Texture URLs are never constructed for block-state suffixes that do not exist; aliases map stairs, slabs, beds and other stateful blocks to a valid representative texture.

This is a representative block-face renderer, not a complete Minecraft model renderer. Doors, panes, stairs and redstone components still need model/state geometry if exact client appearance is required.

## Large structures

The current preview keeps a bounded surface sample for very large structures, groups blocks by 16x16x16 render chunks, and yields between chunk mesh insertions. This keeps the UI responsive while preserving the full BlockGrid for export and material counts. It does not discard blocks from Litematic/Schematic export.
