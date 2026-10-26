# CraftAIB license and distribution audit

Audit date: 2026-10-11

This is an engineering provenance audit, not legal advice. It records the files and boundaries that must be reviewed before any public or commercial distribution.

## Findings

### Blocker: repository root license is not a combined-work license

The root `LICENSE` currently contains an All Rights Reserved notice naming Voxelartcraft placeholders. It does not describe CraftAIB, the MIT Craftmatic code, the GPLv3 Cartographer code, or the LGPLv3 Litematica reference used by the new adapter. Do not publish a release using this root license as if it grants rights to the complete repository.

Required action before release: choose an explicit distribution model, replace or supplement the root notice with a complete third-party notices file, and have the resulting license bundle reviewed by a qualified lawyer.

### Voxelartcraft

- Submodule: `vendor/voxelartcraft`
- Pinned commit: `708732579536d16c7d7762c01c499671ae7cc490`
- Notice: All Rights Reserved
- Current use: browser workbench and algorithm/provenance reference
- Risk: do not redistribute copied source, assets, shaders, palette data, or a bundled derivative without explicit permission. Keep the adapter boundary and attribution.

### Craftmatic

- Submodule: `vendor/craftmatic`
- Pinned commit: `59f76c889ab1f0efdf08adeffa7dfc78a6631ae2`
- Notice: MIT
- Current use: structure generation, schematic parsing/writing, rendering and viewer semantics through adapters
- Required action: preserve the upstream copyright and MIT notice in any redistribution that includes copied portions.

### Cartographer

- Submodule: `vendor/cartographer`
- Pinned commit: `784c1d90e5072cae118fcce82050fbe7737ed86f`
- Notice: GPLv3 in `vendor/cartographer/LICENCE`
- Current use: Map Art, palette generation, Litematica serialization concepts and adapter code
- Risk: a combined distributed work containing GPL-derived implementation may require GPLv3-compatible distribution, source offer, notices, and corresponding obligations. Keep the adapter/source boundary explicit.

### WaxMapArt

- Source: `https://github.com/lllggghhhaaa/WaxMapArt`
- Notice: Apache-2.0
- Current use: TypeScript port of the map-color table, color matching, shading, dithering and flat/staircase placement algorithms in `packages/waxmapart-adapter`.
- Required action: retain Apache attribution and verify any separately sourced palette-data terms before distribution.

### BuilderGPT

- Source: `https://github.com/CyniaAI/BuilderGPT`
- Notice: Apache-2.0; upstream marks the project paused.
- Current use: design reference for explicit construction helpers and allowed block IDs only. No BuilderGPT code, CyniaAgents runtime, QuickJS, or generated-code execution is integrated.
- Required action: include its Apache notice if expressive prompt text/source is copied later; re-review before distribution.

### Litematica

- Reference checkout: `work/litematica-reference`
- Reviewed commit: `479a4f0cbefa09666af4cd49cbb19d727090fc2d`
- Notice: LGPLv3 in `LICENSE.txt`
- Current use: format and placement semantics reference; no Java UI, Mixin, renderer, or runtime code copied
- Risk: keep the reference provenance documented. Reassess if any Java implementation is copied later.

### Lodestone

- Source: `https://github.com/mattzh72/lodestone`
- Version: `0.6.0`
- Notice: MIT
- Current use: opt-in Three.js blockstate/model renderer and bundled vanilla default pack under `frontend/public/lodestone-default-pack`.
- Required action: preserve the Lodestone MIT notice and the default-pack license notice in any distributed build that includes these assets.

## Current safe posture

- Treat the workspace as internal integration only.
- Do not publish a binary, hosted bundle, or npm package as unrestricted commercial software.
- Keep upstream repositories as submodules at their pinned commits.
- Keep generated browser bundles as build outputs, not as a way to hide upstream provenance.
- Add third-party notices and exact source/license links to any release artifact.
- Re-run this audit when an upstream commit changes or when a new file is copied across an adapter boundary.

## Release checklist

- [ ] Decide whether the release is internal, GPL-compatible, or permission-based.
- [ ] Replace/supplement the root `LICENSE` with an accurate combined-work notice.
- [ ] Include MIT, GPLv3, LGPLv3, and Voxelartcraft permission notices as applicable.
- [ ] Verify whether browser assets, textures, palettes, generated bundles, and documentation have independent licenses.
- [ ] Preserve submodule commit IDs and source URLs.
- [ ] Obtain legal review before commercial or public redistribution.
