# CraftAIB

CraftAIB is the unified Minecraft map-art workspace for turning an image into a buildable Minecraft artifact.

## Integrated upstreams

- [`vendor/voxelartcraft`](https://github.com/41pha1/Voxelartcraft): browser image-to-voxel conversion, dithering, block palette, and NBT export.
- [`vendor/craftmatic`](https://github.com/tribixbite/craftmatic): schematic parsing/writing, structure generation, textured rendering, and Three.js viewing.
- [`vendor/cartographer`](https://github.com/julienvincent/cartographer): map-art generation, palette balancing, staircasing, material lists, and Litematica/JSON/NBT transforms.

The upstream projects are tracked as Git submodules so their licenses, history, and update paths remain explicit while CraftAIB adds the integration layer.

## Quick start

Requirements: Node.js 22, pnpm 11, and Git.

```powershell
pnpm bootstrap
pnpm build
```

Run an upstream web application while the unified UI is being built:

```powershell
pnpm dev:craftmatic
pnpm dev:cartographer
```

Voxelartcraft is a static browser application. Open `vendor/voxelartcraft/index.html` directly, or serve that directory with any static HTTP server.

## Integration plan

1. Establish one shared image/import contract in CraftAIB.
2. Route the same generated block grid into Cartographer's map-art formats and Craftmatic's schematic/rendering pipeline.
3. Add a unified React interface with explicit loading, empty, and error states.
4. Keep upstream changes isolated and add adapters/tests at the CraftAIB boundary.

This repository currently contains the reproducible project foundation and upstream pins. It does not claim that the three independent UIs are already merged into one runtime.
