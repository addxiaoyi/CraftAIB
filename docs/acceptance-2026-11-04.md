# 2026-11-04 交付验收记录

本轮覆盖真实模型有界尝试、客户端验收包、Linux 完整验证和 GitHub 交付准备。所有日期按 Asia/Shanghai 记录。未部署或重启已有服务。

## 自动验证

- Windows：Node.js 26.9.0，最终 `npm run verify` 退出码 0。
- Linux：Debian Bookworm，Node.js 24.22.2，pnpm 11.23.0，最终 `npm run verify` 退出码 0。
- Linux 镜像：`node:24-bookworm@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413`。
- 两个平台均通过引擎、Builder、AI 合约、Worker、二进制 fixture、CLI、服务端、结构/项目状态、纹理、8 项工具链测试、类型检查、生产构建及 10 组浏览器套件。
- 浏览器验证包含编辑后下载并回读、项目恢复、资源包、响应式导航和 64,272 方块交互；受监控页面异常为 0。
- 新增 QuickJS 回归通过：正常构建、构造器路径不能访问 Node 宿主、死循环中断、内存上限、不能吞掉方块预算异常，以及后续请求恢复。
- 原生 placement 回归通过：origin/pos 数组、大写旋转/镜像枚举、包装子区域、渲染状态和选中区域。

Linux 验证使用工作区源码副本，排除了 `.env`、Windows node_modules、生成物和无关日志；三个 vendor 目录来自已提交的固定基线。依赖通过 `pnpm install --frozen-lockfile --ignore-scripts` 安装，浏览器通过 `pnpm exec playwright-core install --with-deps chromium --only-shell` 安装。没有创建托管 Codespace。

初次干净环境验证发现缺少 `vendor/craftmatic/dist` 导致 Worker Viewer 失败。引擎构建现已自动编译其三个必需入口，修复后完整验证通过。Codespaces 初始化显式拉取子模块，使用同一构建入口。

本地证据：`outputs/windows-verify-final.log`、`outputs/linux-acceptance/verify-final.log`、`outputs/linux-acceptance/install-final.log` 和 `outputs/linux-acceptance/client-pack-final.log`。生成日志未作为源码提交。

## 真实模型

已配置模型为 `deepseek-flash`，thinking 为 off。有界尝试限制为每次最多 2 个 provider 请求、单请求 90 秒、总请求时间 185 秒和 10,000 次方块写入。

执行了两次有界尝试。第一次脚本遗漏 SSE failure 事件，仅记录 NO_RESULT；修复事件处理后，第二次明确记录服务商 `MODEL_AUTH_FAILED`。用户选择保留失败证据并停止重试。

没有生成结果，因此建筑质量、真实模型产物导出及参考图重建均不能计为通过。证据保留在 `outputs/model-live-attempt2/report.json`。后续更新本地认证配置后执行 `npm run test:model-live`；密钥不应出现在聊天、报告或提交中。

服务端模型代码现使用独立 QuickJS WASM 上下文，执行期限 2 秒、guest 内存上限 64 MiB，只暴露方块记录函数。外部网络请求的超时和次数另行限制；直接调用同步 engine helper 而未传 evaluator 的路径仅用于受信任脚本。

## Minecraft / Litematica 验收包

命令：`npm run acceptance:client`。输出 `outputs/client-acceptance/craftaib-client-acceptance.zip`。

- 基线为 Minecraft Java 1.20.1；101 个方块、Directions/Container 两区域、负区域位置。
- 四组放置：原始、顺时针 90°、南北镜像、镜像后旋转，附关键地标坐标。
- 楼梯四个朝向、原木三个轴向、双半门、箱子名称和两个物品槽位。
- 独立文件样例覆盖 NBT long 与 byte array；额外标签只验证文件往返，不承诺游戏保留。
- 内部 placement 与原生 placement 分别提供，附路径替换工具；工具不修改游戏配置。
- 附 SHA-256 清单、操作说明和待填写的 RESULTS.md。

包已用项目解析器回读，主 Litematic 另用 prismarine-nbt 独立解析核对版本、区域原点、方块总数和箱子内容。原生 JSON 格式对照 Litematica 上游提交 `afb3feb258aacdc52901217bec233e2bee880b21` 的 SchematicPlacement/SubRegionPlacement。

固定压缩与 ZIP 时间后，Windows 和 Linux 输出包的 SHA-256 完全一致：

```text
1ca12a9d3eb58cdb6564b1279977739a7af8cda1ca6116d5108ef63517371fe9
```

尚未执行实际 Minecraft 客户端加载、创造模式粘贴、箱子物品或放置持久化验收。生存 Easy Place 不作为容器 NBT 的验收依据。

## 提交边界

纳入完整的工作台、Builder/纹理、结构与项目持久化、适配器、构建和验收脚本及文档，包含本轮依赖的先前相关改动。保留 `.dsh-progress/`、`debug.log` 和 `vendor/craftmatic/src/convert/voxelizer.ts` 的无关改动，不修改子模块 gitlink，不提交 `.env` 或 outputs。

目标为当前 `dev` 分支；远端默认分支为 `main`，交付前起点同为 `8cdb13bed36613a13ce05e82ac634428990fdeb2`。提交和推送结果以本轮终端回执与远端 HEAD 核验为准。仓库当前没有 GitHub Actions workflow；本地验证不等同于远端 CI 或部署。

构建仍有 Three.js 大分包和 Vite 未来原生配置加载兼容性提示，未宣称已完成这两项优化。
