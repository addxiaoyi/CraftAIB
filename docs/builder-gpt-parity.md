# BuilderGPT parity

Reference implementation: [CyniaAI/BuilderGPT](https://github.com/CyniaAI/BuilderGPT) (upstream is
unmaintained; its own README points to a successor project). This page records what was ported
into `packages/ai-planner/src/builder/`, what deliberately differs, and how it is verified.

## The contract, kept verbatim

BuilderGPT is, in effect, a *wire format* between an LLM and a Minecraft world. The port keeps that
wire format identical, so a prompt/vine exchange written for BuilderGPT works here unchanged.

| Contract | BuilderGPT | This repo |
| --- | --- | --- |
| Entry function | `function buildCreation(startX, startY, startZ)` | same, in the `<code>` block |
| Helpers | `safeFill`, `safeSetBlock`, `safeFillBiome` | same names, same argument order |
| `safeFill` corners | both inclusive | same |
| Fill mode | `destroy` / `hollow` / `keep` / `outline` / `replace` (+ `replaceFilter`) | same, as the trailing string **or** the documented `{ mode, replaceFilter, blockStates }` object |
| `replace` with no filter | replaces air only | same (`AIR_BLOCK` default) |
| `replaceFilter` matching | compares the block id at the cell, states ignored | same (`blockIdOf` strips `[...]`) |
| fill volume cap | 32,768 (vanilla `/fill`) | same; over-cap becomes an `invalid` step, not an exception |
| Block catalog | `block_id_list.txt`, 250 lines / 234 unique ids | `block-catalog.ts`, same 234 ids (diff-verified) |
| Namespace | `minecraft:` restored, `blockStates` key-sorted | `normalizeBuilderBlock` |
| Reply tags | `<build_planning>`, `<inspiration>`, `<description>`, `<code>` | `parseBuilderSpec` |
| System prompt | SYS_GEN template | `createBuilderSystemPrompt` |
| Ground rule | underground at/below `startY`, above-ground above it | stated in the prompt |
| No async | helpers called synchronously | stated as CRITICAL in the prompt |

Catalog check (the upstream file has 6 duplicate ids; the catalog is the *unique* set):

```bash
# 234 unique bare ids, namespace-free
node -e "import('./packages/ai-planner/dist/builder/index.js').then(m=>console.log(m.BUILDER_BLOCK_NAMES.length))"
```

## Deliberate differences

| Area | BuilderGPT | Here | Why |
| --- | --- | --- | --- |
| JS runtime | QuickJS (embedded C) | QuickJS WASM for server model replies | Fresh context per script; 2-second deadline and 64 MiB guest memory cap. Direct engine calls without an evaluator are for trusted local scripts only. |
| Host globals | absent inside QuickJS | no Node/browser host objects in the server's guest context | Only three recording helpers cross the WASM boundary using copied arguments. Global shadowing alone is not a security boundary. |
| `async` scripts | `async`/`await` stripped | only the canonical synchronous body is replayed; async signatures are rejected with a warning | Stripping `await` changes program order silently. A failed build is better than a subtly different one. |
| Placements | `dict[(x,y,z)] = block` | ordered `BlockWrite[]`, then `voxelMaskFill` replays them | Same last-write-wins result for `replace`; `keep` and `hollow` need the order to replay correctly. |
| Air | stored as a value | `replace` deletes the cell; other modes ignore it | A schematic cannot contain air cells, and `air keep` is a no-op in vanilla. |
| World offset | kept inline | `recorderToVoxelMask` shifts min corner to origin | `BlockGrid` is zero-based; negative coordinates would otherwise be rejected by `validateGrid`. |
| Budget overflow | silent, then mcschematic fails | throws `builder block budget exceeded`, recorded as `ok:false` | The call sites already catch; a loud failure beats a truncated build. |
| Export | mcschematic (`.schem`), `.mcfunction` | existing `serializeSchematic` / `serializeLitematica` + `stepsToCommands` | No new serializer. Sponge v2 is the same format mcschematic writes. |
| Output type | `.schem` file | `BlockGrid` (JSON), then any existing exporter | Lets the viewer, checkpoints, merges and the structure planner share one type. |
| Skinning | bakes block textures onto a model-side atlas | the shipped LodeStone atlas at its own size, UVs read from the real `blockstates`/`models` (`cullface` honoured) | The face texture is the resource-pack one, not a nearest-colour guess; there is no separate bake artifact to drift from the pack. |
| Texture lookup | `_bake_with_reader` is a placeholder that always returns `None`; baking falls through to `_bake_fallback`, which tries `_top`/`_side`/`_bottom` suffixes, special-cases `_SPECIAL_FACE_GRASS`, and otherwise rolls back to a sha1 colour block | `modelsForState` + `resolveSpriteId`; blockstates/models are resolved by name, then by common prefixes and suffixes | A missing texture is a visible `missing` entry, not a silent hash colour; the atlas never has to be rebuilt per block. |

## Where it lives

```
packages/ai-planner/src/builder/
  block-catalog.ts   234 unique ids + get_minecraft_blocks lookup
  spec.ts            helper signatures, BuilderSpec, normalizeBuilderBlock
  recorder.ts        ordered writes, fill modes, budget
  script-runner.ts   injectable evaluator, steps + commands; trusted local fallback
  execute.ts         run -> VoxelMask -> BlockGrid
  voxelize.ts        replay writes, compute extents, mask validation
  spec-parser.ts     <code>/<inspiration>/<description>, fence and bare replies
  prompt.ts          SYS_GEN system prompt
  build-entry.ts     builderMessages / builderFromReply / builderRequest
  index.ts           barrel
```

A host application supplies a `BuilderModelTransport` (any `(messages) => Promise<{text}>`). This
package never opens a connection, so browser, CLI and desktop share the same code.

## CLI

```bash
craftaib structure builder reply.txt build.json build.mcfunction
craftaib export schem build.json build.schem      # Sponge v2
craftaib export litematic build.json build.litematic
craftaib structure glb-textured build.json build.glb [--pack <assets.json>]
```

`glb-textured` writes a binary glTF that carries the block textures with it: one primitive with
`POSITION`/`NORMAL`/`TEXCOORD_0`/`_EMISSIVE`, uint32 indices, the PNG atlas in a buffer view, and a
material whose sampler is `NEAREST`/`CLAMP_TO_EDGE` (`9728`/`33071`). UVs are flipped on V to match
glTF's top-left texture origin. `--pack` defaults to `frontend/public/lodestone-default-pack/assets.json`;
`atlas.png` is read from the same directory, and if it is absent the export degrades to the flat
`solid` material instead of failing. The build's `BlockGrid` is the same one `structure analyze`
sees, so unsupported blocks show up as `missing` in the JSON line rather than as invented colours.

`build.mcfunction` is the `commands` array, one command per line; rejected writes appear as
`# rejected: ...` comments so a lost fill is visible in-game instead of silent.

## Verification

`scripts/builder-smoke.mjs` (wired into `npm run test:engine`) asserts, with no network:

- catalog size, uniqueness and bare-id form;
- tagged reply parsing, including `planning` passthrough and quoted-id discovery;
- `<code>`, fenced and bare-script extraction;
- floor + four walls + roof fixture: boxes, grid dimensions (5 x 4 x 5), cell count;
- `keep` on an occupied cell is a no-op (`glass_pane` never lands, wall stays oak); the object
  form `{ mode: "keep" }` behaves identically to the bare string;
- `replace` + `replaceFilter` overwrites only cells holding the filtered block and leaves the
  rest untouched; a filterless `replace` touches air only;
- mode objects never leak into command text as `[object Object]`;
- `hollow` leaves the interior empty while the shell is filled;
- a fill above 32,768 volume is rejected in place and does not abort later calls;
- biome writes are recorded and emitted as `fillbiome`;
- the system prompt carries the planning, tag blackouts and the no-async rule;
- `builderRequest` round-trips a transport and yields the same grid;
- textured GLB: glTF magic/version/length, both chunk kinds, 4-byte alignment, `faces * 16`
  vertices and `faces * 24` indices against `analyzeBuild().exposedFaces`, uint32 indices,
  unit normals, `TEXCOORD_0` inside `[0, 1]`, NEAREST/CLAMP samplers (`9728`/`33071`), the atlas
  PNG embedded byte-for-byte with `mimeType: image/png`, material 1 for the atlas and a fallback to
  material 0 when it is absent;
- `_EMISSIVE`: a lone `lantern` carries the pack's own intensity on every face, `stone` carries 0;
- culling: two `stone` blocks hide their shared face (40 quads), while a transparent neighbour does
  not (`white_stained_glass` keeps its own and leaves the stone's 29 quads intact).

End-to-end, `structure builder` -> `export schem` -> `schematic info` was run on the same reply:
5 x 2 x 5, 50 cells, 25 stone / 24 oak / 1 lantern, and `.litematic` exported to the same counts.
`structure glb-textured` on `fixtures/smoke-grid.json` produced the same bytes with and without
an explicit `--pack`, and a 3x3x3 `stone` cube's GLB carried the full `atlas.png` (1,466,253 bytes)
in one PNG buffer view behind material 1.

## Known gaps

- The catalog is the upstream one; it is a *subset* of 1.20.4 (no `stone_bricks`, no
  `oak_stairs`, no `glass_pane`), so models are constrained to it. Widening the catalog means
  regenerating `block-catalog.ts` and re-running the smoke test.
- `blockStates` are normalised but not used by the grid-to-schematic writers beyond block
  properties; directed blocks (stairs, logs) rely on those properties.
- `blockStates` (2026-11): upstream `_normalize_block` sorts the states from the
  `blockStates` option into the block text but silently drops inline `block[key=value]`
  text; we keep both and merge (options win over inline), so commands and grid agree
  (`oak_log[axis=y]` + `{blockStates:{axis:"z"}}` -> `oak_log[axis=z]`). Command text keeps
  bare ids (`setblock 0 0 0 stone`), a deliberate difference from upstream's namespaced
  `minecraft:` mcfunction output.
- Directed blocks (stairs, logs) carry their properties, but no state is validated against a facing or half before export.

## Circulation fixes (2026-11)

Measurement changed the diagnosis here, so keep the final reading rather than the first guess.

1. **The first "stairs never climb" report was wrong.** In the fallback generator the
   `stairs` parts satisfy `height == run` (7/7 and 4/4 in the measured plans), so the
   `min(y1 - y0 - 1, step)` cap was never reached and the top step already sat at
   `y0 + run - 1`. The real defects were: no stairwell opening was cut, so the flight rose
   under a solid deck; the approach cell was occupied by the first step; and in the geometry
   path, which the UI always takes because it sends `constraints`, the part started at the
   floor block's own level, so the floor slab hid the first step and the next floor
   overwrote the top one. A probe on a 14 x 26 x 14 six-floor tower reported
   `approach blocked`, `head blocked` and `no landing` for every flight.
2. **What the code does now.** `structurePlanToGrid` handles stairs in a second pass after
   every other part, so a top step can overwrite the arrival deck. A flight climbs one block
   per cell to `nextFloorY`, removes the deck cells above each lower step, and clears the two
   headroom cells per step below the lowest roof part (`roofBase`); that removal is skipped
   where it would cut the roof. The fallback path fills its decks solid (the old central 3x3
   shaft is gone) and runs two-wide flights along alternating interior walls, starting one
   cell away from the wall so the approach is free and the run ends on a solid landing.
3. **The chair** is an `oak_planks` box. The earlier change from `stairs` to `box` kept the
   `oak_stairs` material, which exported a stair without `facing`/`half`; a one-cell chair
   reads better as a plain block.

Verified numerically with a probe over nine plans (five fallback, four geometry, including an
exterior-only build): every flight has a support cell under its first step, a free approach
cell, an open flight, an uncapped top step and a solid landing; the exterior-only plan has no
stairs by design. `scripts/engine-smoke.mjs` now asserts the same invariant for one fallback
and one geometry plan. No pixel-level comparison was made (the model has no image input).


## Creative freedom by default (2026-11)

The generation path no longer ships a house-shaped brief. Unless the user picks a size preset,
moves a dimension slider, edits a dimension field or chooses a detail level, the request carries
no `width`/`height`/`length`, no `floors` and no `detailLevel`; the model derives the envelope and
the amount of detail from the description and the reference image. The settings panel exposes an
explicit `Auto` tile for size and detail so a locked value can be released again.

What still constrains a build, and why:

- `validateStructurePlan` and a non-empty `BlockGrid` -- correctness, not taste.
- Hard dimensions when the user explicitly selected them -- a promise made to the user.
- Reference-image envelope mode -- an oversized plan is clipped to the selected maximum.
- Block budget (`CRAFTAIB_MAX_GENERATED_BLOCKS`) -- the viewer and exporters have limits.
- `ensureLanternCore` and the lantern-object wording -- a lamp must contain a light source, not
  rooms; the wording is object-specific, not general architecture guidance.
- The interior audit when `detailLevel >= 4` is *explicitly* requested -- an opt-in floor, not a
  default. Interior wording in the server prompt is a preference ("coherent usable interior"),
  and the build decides room count, circulation and furnishings; the planner no longer injects any
  of them into the plan. The lantern light core is the only synthesized geometry that remains:
  `ensureLanternLightCore` adds `generated-lantern-light-core` for a lantern-shaped brief and
  nothing else. The audit's remaining condition is voxel-based, not a content quota -- a declared
  interior must contain actual blocks (at least three occupied interior cells) *and* leave usable
  space (at most 90% of the audited cells solid, so a solid mass cannot pass as a room). Rooms are
  found from `plan.rooms`, room-named regions, or `room`/`circulation` geometry parts, so a plan
  that declares its rooms only through parts is still auditable. One shared `lanternChamber` helper
  picks the chamber for injection and for the light audit, so the server cannot inject a core into
  one region and then look for it in another.

`ARCHITECTURAL_AESTHETIC_SKILL` (now titled `ARCHITECTURAL GUIDANCE (ADVISORY)`) starts by saying
the user's brief and the reference image outrank it. The eleven points stay as habits that tend to
read well; the composition quotas ("one main mass", "one focal feature", "do not give every part
equal weight") are gone. Construction-quality and tool-contract points are unchanged.

## Typed preview geometry (2026-11)

`planBuilding` always draws typed geometry parts, with or without constraints, so the no-settings
preview no longer falls through to the raster fallback. A brief that names no size larger than 48
blocks across first takes its envelope from `addMassingGeometry` (a tower stays tall and narrow, a
bridge reads as a span) and then the same detail pass builds it. The UI already sends a constraints
object from `frontend/src/integrations/building.ts`, so this closes the gap between the browser
preview and the CLI for the same brief. Measured on the default briefs
(`planBuilding({ prompt, seed: 7 })`, then `structurePlanToGrid`):

| brief | dimensions | floors | parts | cells |
| --- | --- | --- | --- | --- |
| `small stone house` | 24 x 10 x 24 | 2 | 5 | 3824 |
| `a gothic tower` | 14 x 26 x 14 | 2 | 29 | 1930 |
| `a stone bridge over a river` | 12 x 16 x 48 | 2 | 14 | 2444 |
| `a cave` | 32 x 20 x 32 | 2 | 13 | 3334 |

- **Roofs narrow upward.** A gable roof fills the full footprint on its eaves course and insets one
  block per side per course, so the top course is the ridge. The measured house roof is 576 -> 528 ->
  480 cells over three courses. The earlier prism counted from the ridge instead, which made the
  eaves *narrower* than the top and produced an inverted skirt. Roof rise stays
  `min(8, max(2, floor(min(width, length) / 8)))`, keeping seven wall courses and a three-course roof
  on the 24-wide house rather than a roof that swallows the walls.
- **Towers end in battlements, not a flat lid.** The shell is one course shorter with its top open;
  the deck fills `height - 2` (196 = 14 x 14 cells) and the crown of merlons sits at `height - 1`
  (34 cells: four 2 x 2 corners plus the edge merlons). Before, deck and merlons shared a layer, so
  the merlons were buried in the deck.
- **Stairs keep headroom.** A flight removes the deck cells above each lower step and caps its
  clearance at the lowest roof part (`roofBase`), so it cannot saw through the roof.
- **The door goes in last.** `addComponents` writes the front door (`dark_oak_door` at x = 7,
  y = 1/2, z = 0, facing south on the tower) after geometry parts and model components, so the shell
  cannot overwrite it.

Limits: these are preview heuristics for the local generator. A model-authored plan keeps its own
geometry; the heuristic parts only cover the fallback. No rendered or pixel-level comparison was made;
the figures above are cell counts and part lists.

## Inspecting a build

The preview pipeline's numbers are reachable without rendering anything:

```bash
craftaib structure analyze build.json        # also .schem and .litematic
```

`analyzeBuild` reports width/height/length, solid cells, fill ratio, the palette and how
many cells carry block states, plus the mesh-relevant split:

- `shell` -- solid cells touching the bounding box, on any of its six sides
- `interior` -- solid cells whose six neighbours are all solid (buried, no visible face)
- `exposedFaces` -- solid:empty neighbour pairs inside the box, i.e. the quads a mesher emits
- `materials` -- counts per block id, heaviest first

A 3x3x3 `stone` cube is 27 cells, 26 shell, 1 interior, 54 exposed faces (6 per surface cell, the
way upstream `mesher.py` counts a unit cube per face without merging coplanar quads). The smoke
fixture's hollow hut keeps `interior === 0` and a non-zero `exposedFaces`, which is the property a
hollow build should always have.

The GLB emits one quad per block face, 16 vertices each, so its vertex count is `exposedFaces * 16`
and its index count `exposedFaces * 24`; the same 54 faces become 3,456 indices.

## Builder mode in the app (2026-11)

Text-only prompts that lock no width, height or length take the BuilderGPT path when a building model
is configured. `frontend/src/integrations/building.ts` sets `mode: 'builder'` only for that case;
`scripts/server.mjs` accepts it only when the request carries no reference image, builds the
`builderMessages` conversation, calls the configured model (temperature 1, no tool offers),
extracts the `<code>` block from the reply and executes it with `builderFromReply`. The route returns
`{ ok, plan, grid, regions, generationLog }`, and the `ai.structure-plan` task forwards
`{ plan, grid, regions, source: 'ai', generationLog }`. A reply without a usable code block, a
script that throws and an empty grid are rejected as `BUILDER_REPLY_INVALID`,
`BUILDER_EXECUTION_FAILED` and `EMPTY_BLOCK_GRID`.

Before rejecting, the route makes one repair turn by default (`CRAFTAIB_BUILDER_REPAIR_ATTEMPTS`,
0--2): it sends the failed reply back as an assistant message plus the concrete execution error
and asks for one complete corrected `<code>` script. The attempt is recorded as `builder_retry` in
the generation log and the request budget restarts per provider call.

`CRAFTAIB_MODEL_THINKING` controls reasoning models: `auto` sends nothing, `low` sends
`reasoning_effort: "low"`, and `off` sends `{"thinking":{"type":"disabled"}}`. The same setting is
applied to the plan loop, the builder request, the connection probe and `/api/ai/config`
(`generation.thinking`). It exists because reasoning-model gateways commonly cut a non-streaming
request near 120s; with `off`, a real `deepseek-flash` builder request over the Moxuna gateway
completed in about 36s instead of returning HTTP 504. An upstream 504 is reported as
`MODEL_TIMEOUT` with guidance to switch thinking off. Upstream streaming was measured on the same
gateway and was slower (still unfinished at 180s with thinking off, versus 36s non-streaming), so
the builder transport stays non-streaming.

Reference-image prompts and prompts with locked dimensions stay on the structure-plan/vision path.
`building.ts` selects `mode: 'plan'` when a reference image is present or any of width, height and
length is locked, and the server ignores `mode: 'builder'` for an image request.

Every `build_voxel_structure` call is validated, and a byte-identical plan (same dimensions,
facing, palette and parts) is normally rejected so a loop cannot spend the whole turn budget.
Rejection is wrong when that earlier plan already passes the reference gates (silhouette >= 60%,
missing <= 18%, extra <= 20%): the server now answers with a successful reuse of the existing
build, tells the model to inspect and review it, and finalizes it on a second identical
submission. Before this, a real `deepseek-flash` run rebuilt a 86%-silhouette watchtower until
the duplicate guard ended the request with no result. The behavior is covered by
`scripts/vision-contract-smoke.mjs`.

If the model keeps repeating a *failing* plan, three consecutive rejected builds stop the loop.
That abort now returns the closest built structure (highest reference-match score) with the
measured silhouette/missing/extra deficit in its note, instead of discarding every attempt. Plans
that never reach the voxel grid at all (bad dimensions, out-of-bounds parts, region-only plans)
still fail with `BUILD_VALIDATION_REPEATED`, because there is nothing to salvage.

The AI preview now uses the Lodestone renderer (`LodestoneViewport` over `ThreeStructureRenderer`
with the bundled pack) instead of one guessed texture per cube: the pack's block models, per-face
UVs and transparent textures drive the preview. The Y slider filters blocks before rendering,
builds above 250,000 preview blocks fall back to the solid `ThreeViewport` with an explicit
"solid preview" notice, and the legacy `grass` id is previewed as `short_grass` through
`frontend/src/utils/blockAliases.ts`. The preview's Textured/Solid toggle switches between the
model renderer and solid instanced cubes rather than wireframe, and it is disabled while the
block cap forces the solid path.

Slice dragging no longer recreates the renderer: the viewport splits pack/renderer lifetime from
structure updates, so a slice change calls `ThreeStructureRenderer.setStructure` and rebuilds the
mesh in place. The renderer is recreated only when the resource pack or the structure envelope
(size) changes; the camera is captured on teardown and restored when the envelope matches. The
bundled pack fetch/decode is cached per page and custom packs per `File` (a rejected load clears
the entry so a retry can recover), and the worker mesh-index statistic is debounced instead of
blocking the first frame. Generating a new structure resets the Y slice to full height.

`scripts/ai-generation-browser-smoke.mjs` covers both the render and the slice path: it checks the
canvas is painted and that slicing shrinks the block count while keeping the same renderer
instance (`data-lodestone-instance`).

### Earlier real-model notes (not revalidated in this handoff)

The following notes predate the current acceptance run. On 2026-11-04 the configured endpoint
returned `MODEL_AUTH_FAILED`; no new build was generated and the user requested no more retries.
See `acceptance-2026-11-04.md` for the current evidence.

A live `deepseek-flash` endpoint (OpenAI-compatible gateway, `thinking: off`) was used to exercise
the whole chain rather than a mock: direct builder request 36s for a 6x7x7 hut; browser UI
generation `requestMode: "builder"` in 69s, with the first script failing on an undefined variable
and the repair turn producing a 653-block grid that rendered through Lodestone with 300 quantized
colours and full canvas coverage. A direct vision check with two 16x16 solid images returned
"Red" and "Blue" respectively, so the same model can read reference images; the in-app
`/api/ai/test-connection` vision probe only proves tool calling, not image understanding. The run
also exposed a deployment trap: `build-browser-worker`
writes `packages/engine-worker/dist/browser/browser-worker.js`; `stage:browser-worker` must copy it
to `frontend/public/engine-worker.js` (and `build:ui` into `dist`) or the UI keeps an old worker
that drops `mode` and silently falls back to the plan path. `npm start` stages it through
`prestart`; a manually started `scripts/server.mjs` does not.

`scripts/ai-generation-browser-smoke.mjs` asserts the preview is actually painted: after a
generated plan it screenshots the preview canvas, requires the Lodestone status to leave the
loading text, and checks opaque coverage (measured 1.0) plus quantized colour diversity
(measured 107 distinct colours for a 3,404-block plan). The check is a render smoke, not a
texture-identity comparison.

`npm run test:builder-textures` (`scripts/builder-texture-regression.mjs`) guards the pack against
that catalog. It resolves every `BUILDER_BLOCK_NAMES` id (234), then every model referenced by its
blockstate variants and multipart `apply` entries, walks each model's `parent` chain to resolve
`#texture` variables and checks every referenced texture exists and sits inside the atlas
(2048 x 1248, read from the PNG header). It also checks the palettes of four default preview plans
(`planBuilding({ prompt, seed: 7 })` for `small stone house`, `a gothic tower`,
`a stone bridge over a river` and `a cave`). Measured at this revision:

| check | result |
| --- | --- |
| BuilderGPT catalog ids | 234 |
| resolved | 234 (233 direct blockstates plus `grass`) |
| catalog missing | none |
| unique palette ids across the four plans | 8 |
| palette missing | none |
| failures | none |

The alias is the only legacy name: the pack has no `grass` blockstate, but it does ship
`short_grass`, `tall_grass` and `grass_block`. The script exits 1 and prints at most 40 failures if
any id stops resolving. No rendered or pixel-level comparison is made; the check is structural
(ids, models, texture references, atlas rectangles).
