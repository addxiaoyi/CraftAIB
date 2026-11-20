# 本地贴图复核（2026-11-05）

本记录对应本地 `http://127.0.0.1:4183/` 的真实结构 `ornate_lantern_revision`。浏览器截图、回归 JSON 和原始日志保存在 `outputs/local-texture-review-20261105-200333/` 及其 `-after-fix` 目录；这些输出不纳入 Git。

## 结果

- 默认贴图：实体预览显示 `missing=0`，状态为 `Minecraft textures ready`；真实模型显示 `Minecraft resource pack ready · 4 chunks · 2,060 faces`。
- 结构材料：1,259 个方块，材料清单读取到 12 种缺口物料；截图中的木纹、石砖、红色羊毛、玻璃、金块、链条和避雷针均有可见纹理。
- 自定义资源包：彩色贴图、透明贴图、动画首帧、坏包拒绝、恢复默认、再次上传和默认材质重试均通过；`externalTextureRequests=0`，`errors=[]`。
- 原始问题：导入结构省略状态时，`chain` 和 `lightning_rod` 分别缺少 `axis`、`facing/powered`，导致 Lodestone 找不到 blockstate variant，3 个方块不生成网格。
- 修复：预览 provider 仅为无状态的 `minecraft:chain` 补 `axis=y`，为无状态的 `minecraft:lightning_rod` 补 `facing=up,powered=false`；用户已有状态优先，结构数据和导出内容不变。

## 复核命令

```text
npm run typecheck:ui                         exit 0
npm run test:textures                        exit 0
node scripts/lodestone-structure-regression.mjs  exit 0
npm run build:ui                             exit 0
node scripts/resource-pack-browser-smoke.mjs exit 0
```

修复后的专门回归输出为：

```json
{"blocks":8,"nonemptyMeshes":8,"preservesExplicitState":true,"preservesStructure":true}
```

对真实结构的复核输出为 `unmatched=0`；补齐后的状态为 `chain[axis=y]` 和 `lightning_rod[facing=up,powered=false]`。

## 警告边界

浏览器仍记录 `parent minecraft:builtin/entity does not exist!` 警告。默认资源库包含 11 个物品实体模型，但方块状态实际引用链中没有这些模型；`builtin-entity-analysis.json` 记录了 `reachableEntityModels=[]`。本次未修改第三方 `node_modules`，也未把该初始化警告当作当前结构贴图缺失。

本地页面检查完成后，按用户要求停止本轮启动的 PID 61524，并确认 4183 端口不再监听。Minecraft/Litematica 游戏内验收仍需准备客户端后单独执行。
