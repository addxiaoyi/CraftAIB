# CraftAIB 的 Litematica 语义模型

## 参考边界

CraftAIB 以 `maruohon/litematica` 的源码结构作为格式语义参考。该基线源码的 `LitematicaSchematic.CURRENT_SCHEMATIC_VERSION` 为 4；CraftAIB 默认输出 Version 4，并允许通过 options 显式覆盖。本地审阅基线为 upstream commit `479a4f0cbefa09666af4cd49cbb19d727090fc2d`。该上游的 `LICENSE.txt` 是 LGPLv3；CraftAIB 只复用格式语义和公开文件约定，不复制 Litematica 的 Java UI、Mixin、渲染器或运行时实现。公开分发前仍需单独完成许可证审查。

## AI 必须区分的两个对象

### 1. `.litematic` 文件

文件本身是压缩 NBT，描述一个 schematic：

```text
Root
├─ Version
├─ MinecraftDataVersion
├─ Metadata
└─ Regions
   └─ <region name>
      ├─ Position
      ├─ Size
      ├─ DataVersion
      ├─ BlockStatePalette
      ├─ BlockStates
      ├─ TileEntities
      ├─ Entities
      └─ PendingBlockTicks
```

`Regions` 是多个独立子区域，不是只能有一个立方体。每个区域有自己的位置、尺寸、调色板、压缩方块状态、方块实体、实体和待处理方块 tick。

### 2. placement 配置

Litematica 的放置位置、启用状态、旋转、镜像、锁定坐标、子区域变换和当前选中项保存在客户端 placement JSON 中，而不是依赖 `.litematic` 文件本身。CraftAIB 因此分别提供：

- `parseLitematicaDocumentBytes` / `serializeLitematicaRegions`：读写 schematic 文件语义。
- `parseLitematicaPlacements` / `serializeLitematicaPlacements`：读写 placement JSON 语义。
- `applyLitematicaPlacement`：在统一 `BlockGrid` 上应用位置、旋转、镜像和常见方块状态方向变换。

## 坐标和压缩规则

- 统一引擎仍使用 `xyz`，索引顺序是 `y -> z -> x`：`(y * length + z) * width + x`。
- `Position` 是区域锚点；`Size` 可以在任一轴为负数。负尺寸不是错误，负轴的第一个存储单元对应锚点减一。
- 区域单元坐标采用：

```text
size > 0: world = position + local
size < 0: world = position + size + 1 + local (the container starts at the minimum corner)
```

- `BlockStates` 使用 tight long packing；一个状态可能跨越两个 64-bit long，不能只用 `floor(64 / bits)` 分组读取。
- palette 位宽为 `max(2, ceil(log2(paletteSize - 1)))`，ID 0 保留给 air。
- `BlockStatePalette` 不是只有方块 ID；`Properties` 必须保留，例如 `oak_log[axis=x]`、`stairs[facing=north,half=top]`。
- NBT reader 必须支持实体 `Pos` 的 double list，以及 float/double tag；只支持 int/long 会在真实实体 schematic 上失败。

## 统一模型映射

```text
Litematica Region      -> LitematicaRegion
region Position/Size  -> position/size
Palette + BlockStates  -> palette + cells
Metadata               -> LitematicaMetadata
placement JSON         -> LitematicaPlacementDocument
flattened schematic    -> BlockGrid + origin
multiple regions       -> SceneGraph / multiple SceneLayer
```

`parseLitematicaBytes` 为旧 API 返回归一化 `BlockGrid`；新的 `parseLitematicaDocumentBytes` 保留 region 名称、原始位置、负尺寸、metadata 和实体相关计数。归一化时保留最小世界坐标到 `BlockGrid.origin`，避免把原始放置锚点误认为局部坐标。

## AI 建筑生成约束

AI 生成建筑时不能只输出一张方块平面或单一 palette。有效的中间结果应包含：

1. 建筑的整体尺寸和原点。
2. 可独立开关的子区域，例如主体、塔楼、屋顶、庭院、桥、地下室。
3. 每个子区域的局部位置和尺寸。
4. 方块状态属性，而不是只有材料名称。
5. 放置位置、旋转、镜像和是否忽略实体。
6. 材料清单按 region 或 placement 可重新统计。
7. 导出后重新读取 `.litematic`，比较尺寸、region 数、材料数和关键 block state。

推荐的生成链路：

```text
自然语言 / 参考图
  -> StructurePlan
  -> named Litematica regions
  -> BlockGrid / SceneGraph
  -> placement-aware Viewer
  -> .litematic + placement JSON + .schem
```

## 当前实现和边界

已接入：

- direct `Regions` 和旧 `map` 包装形式的兼容读取。
- 多 region 解析。
- 负尺寸区域归一化。
- tight long-array 读取和写入。
- metadata、region material summary、block entity/entity/tick 数量。
- placement JSON 解析、序列化、旋转、镜像和常见 facing/axis/rotation 属性转换。
- CLI `craftaib litematic info <input>`。
- Worker `litematic.inspect`。

尚未声称完全等价：

- Minecraft 运行时的 Easy Place、投影渲染、区块放置任务、Verifier、schematic world 和 Mixin。
- 所有 mod 专属方块实体和实体 NBT 的可视化编辑。
- placement 子区域与实体的完整运行时行为。

这些能力应继续以适配层实现，不能把浏览器 Viewer 的预览等同于 Minecraft 客户端中的 Litematica runtime。

## Viewer and live vision

- The Viewer receives `regions` and `placement` overlays, draws colored Region bounding boxes, and exposes hide/lock/rotate/mirror controls.
- `scripts/vision-live-smoke.mjs` runs a real endpoint test when `CRAFTAIB_VISION_API_URL` is configured. It reads `CRAFTAIB_REFERENCE_IMAGE` (default `examples/example1.png`), validates the returned StructurePlan, exports a multi-Region `.litematic`, and reads it back. Without an endpoint it exits explicitly as skipped; it never fabricates a live result.
- The browser uses the same endpoint only when the user enters a Vision endpoint. No API key is committed or persisted.

- `scripts/viewer-region-browser-smoke.mjs` performs real iframe button clicks for Region select, rotate, mirror, hide, lock, undo, and redo; it asserts the Viewer debug state and main-workbench sync without browser errors.
