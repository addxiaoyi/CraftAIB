# Default Pack License

The files in `assets/default-pack/` (including `atlas.png`, `assets.json`, and `block-flags/*`) are provided by Matthew Zhou and are licensed under the MIT License (same terms as the repository root `LICENSE`).

CraftAIB supplements this upstream pack with 12 original Minecraft Java 1.21 entity textures (hanging signs and the default Steve skin). Those added pixels are Mojang/Microsoft game assets, not newly licensed under MIT. `entity-textures.json` records their official client source, hashes and atlas rectangles. `scripts/complete-entity-textures.mjs` reproduces the addition without changing the upstream pixels.

