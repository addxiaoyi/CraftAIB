# Engine implementation status

## Completed foundation

1. Capability matrix with source paths, runtime boundaries, migration strategy, verification targets, and license flags.
2. Shared TypeScript model and validation for `ImageSource`, `PixelMap`, `BlockState`, `BlockGrid`, `SceneGraph`, and task events.
3. Voxelartcraft, Cartographer, and Craftmatic normalization adapters.
4. Worker protocol and initial Node CLI surface.
5. Cross-adapter smoke tests for normalization, dimensions, material counts, and invalid-grid rejection.

## Next implementation slices

- Move Voxelartcraft's image-processing and WebGL state behind an explicit adapter API instead of DOM/global state.
- Add Cartographer palette matching, dithering, staircasing, balanced material allocation, and Litematica serialization.
- Add Craftmatic Schematic v2 reader/writer, structure generators, PNG renderers, Three.js scene adapter, GLB, and HTML viewer exports.
- Add Worker task registry and cancellation propagation for heavy operations.
- Add unified project persistence and connect the current minimal studio to engine tasks.
- Add isolated LEGO/LDraw and geospatial scene adapters after core Minecraft paths are stable.

## Verification commands

```powershell
node scripts/build-engine.mjs
node scripts/engine-smoke.mjs
```
