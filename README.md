# CraftAIB

CraftAIB uses **Voxelartcraft as the primary application**: upload an image, tune the image and block palette, preview the voxel result, then export Minecraft build artifacts.

## Integrated features

- **Voxelartcraft core**: WebGL image processing, 3D voxelization, dithering, block filtering, material counts, and NBT export.
- **Craftmatic-compatible output**: export the generated voxel grid as Sponge Schematic v2 (`.schem`) for Craftmatic's parser, renderer, 3D viewer, and CLI.
- **Cartographer-compatible bridge**: export a normalized `BlockGrid` JSON file so Cartographer-style map-art and Litematica adapters can consume the same generated block placement without scraping UI state.

The primary UI remains the Voxelartcraft interface. The other projects provide downstream capabilities and format contracts rather than separate pages pasted into the application.

## Run

Requirements: Node.js 22 and a static HTTP server.

```powershell
python -m http.server 4173
```

Open `http://localhost:4173/` in a browser. WebGL2 and `EXT_color_buffer_float` are required.

The app can also be served by any static host. Do not open `index.html` with `file://`; module imports, shader loading, and local assets require HTTP.

## Export workflow

1. Upload an image and configure the Voxelartcraft settings.
2. Click **CUBIFY** and wait for the material count to finish.
3. Export one of:
   - `DOWNLOAD NBT`: Minecraft structure NBT, preserving the existing Voxelartcraft workflow.
   - `DOWNLOAD .SCHEM`: Sponge Schematic v2 for Craftmatic / WorldEdit tooling.
   - `EXPORT BLOCK GRID`: normalized JSON bridge for downstream Cartographer integration.

All exports are generated in the browser. No image is uploaded to a server.

## Upstream sources

- [`Voxelartcraft`](https://github.com/41pha1/Voxelartcraft) — primary UI and voxelization engine.
- [`craftmatic`](https://github.com/tribixbite/craftmatic) — schematic toolkit and renderer, tracked at [`vendor/craftmatic`](vendor/craftmatic).
- [`Cartographer`](https://github.com/julienvincent/cartographer) — map-art and Litematica generation, tracked at [`vendor/cartographer`](vendor/cartographer).

The upstream projects are pinned as Git submodules. Integration code owned by CraftAIB lives in `src/exports.js` and is deliberately kept outside `vendor/`.

## Development notes

`pnpm install --recursive` installs the submodule workspaces. Some dependencies have native postinstall scripts; pnpm may require explicit approval through `pnpm approve-builds` before a full upstream build. The Voxelartcraft browser flow itself has no local bundler requirement.
