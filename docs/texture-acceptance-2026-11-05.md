# 贴图与功能回归记录（2026-11-05）

本轮从 `95de9f1` 开始，检查默认贴图、自定义资源包、渲染器生命周期、视角与方块拾取，并运行既有全部功能回归。真实模型认证与游戏客户端验收继续保留原边界。

## 修复

- 实体预览直接读取仓库内的 `lodestone-default-pack` 图集，按方块模型寻找材质，不再依赖 mcasset CDN。两种预览共享已下载的材质文件，切换不重复请求；请求或 PNG 解码失败均清除失败缓存，支持重试。缺少材质的方块显示颜色预览及数量提示。
- 自定义资源包使用独立图集区域，保留默认像素、贴图分辨率和透明度；保留玻璃剔除、半透明及发光属性。支持自定义命名空间的模型与贴图。
- 动画贴图按 `.mcmeta` 选取首个声明帧作为静态预览，不再把整条帧图压成一张。当前不播放逐帧动画。
- ZIP 解压限制为 128 MiB；图集上限 4096×4096；解码前检查 PNG 尺寸和累计像素。无效 JSON/PNG、循环模型/纹理变量及越界动画帧会给出错误；可重新上传或恢复默认材质。
- 上传资源包自动切换到应用资源包的模型预览，支持再次选择同名文件与恢复默认材质。
- 修正渲染器取消、切换时的观察器、网格和贴图释放；切层重建期间暂停重复绘制，给异步分块构建留出执行时间。只有实际构建完成才显示就绪。
- 修正模型预览的左右拾取反向，使用体素边界遍历确定放置面；桌面侧栏为画布留出空间，视角按钮可以直接操作。
- 参考图读取期间禁用生成并显示读取状态；读取失败可恢复，离开页面会中止读取。

## 验证内容

`npm run verify` 包括引擎、Worker、CLI、服务端、QuickJS、结构/NBT/导出、项目存储、贴图、工具链、类型检查、生产构建及 11 组浏览器测试。浏览器使用本地模型响应夹具，不调用真实服务商。

贴图专项验证：

- 遍历 1,062 种方块状态、1,925 个实际引用模型及 2,039 张贴图；包含 multipart、继承元素和纹理变量链；按 PNG 实际 2048×1248 尺寸检查所有矩形。
- Builder 234 种方块均能解析到本地材质；未知命名空间不会偷偷使用石头贴图。
- 使用石头与橡木板测试墙，在真实浏览器中上传自定义命名空间的 64×64 洋红贴图，确认可见像素改变；更换动画帧包后确认变绿。
- 透明裁切图的可见着色像素约为不透明图的一半；逐字节对比确认默认图集像素完全不变；验证玻璃与发光标志保留。
- 拒绝损坏 ZIP、非对象模型 JSON、损坏 PNG、父模型循环、纹理变量循环、越界动画帧、超尺寸图片共 7 类输入，随后恢复默认材质及重新上传成功。
- 默认实体预览请求失败后可恢复；已知方块的外部贴图请求为零。正面视角左右拾取与顶面拾取通过独立检查。

## 平台记录

贴图实现代码在 Windows / Node 26.9.0 与 Ubuntu 24.04 / WSL2 / Node 24.22.2 分别执行完整 `npm run verify`，退出码均为 0。两端的 8 项工具链测试及 11 组浏览器套件全部通过，没有真实模型请求。完整回归之后只提取了恢复默认材质按钮的命名回调；该等价调整的定向验证见下节。日志位置：

- Windows：`outputs/windows-verify-textures.log`
- Ubuntu 24.04 / WSL：`outputs/linux-acceptance/verify-textures-wsl.log`
- 像素报告及截图：`outputs/viewer-check/texture-acceptance.json`、同目录 PNG
- 加载报告：Windows `outputs/renderer-loading/after.json`；Linux `outputs/linux-acceptance/renderer-loading-textures.json`

Windows 实际截图中的自定义不透明着色像素为 7,395，透明裁切图为 3,761；默认图集改变像素为 0。图集透明/发光标志和资源包切换均通过。原始文件在旧设备本地 `outputs/`，可用上述命令重建验收，不作为 Git 跟踪文件。

证据 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `windows-verify-textures.log` | `b2e31a4fefd725182f81eed5199d7c5376aeb7e7773917907ed2454e49ef72f6` |
| `linux-acceptance/verify-textures-wsl.log` | `c7c99e4cdd52d2a6c896d6e46187fd3e86d51e5da09c42e33f79397915808a4a` |
| `viewer-check/texture-acceptance.json` | `214b5da99a9d4c40a7b7eac7817a0975841f84b12fb3dc9fc61962a4c2bff327` |

最终单次冷启动测量（Chromium 153、1.5 Mbps/40 ms）：Windows 控件 2.443 秒、材质预览 23.404 秒、首次实体预览切换 2.704 秒；Linux 为 2.298 / 23.520 / 3.051 秒。这次在双平台回归期间测量，只用于功能和加载趋势检查，不与历史三次无并行编译的中位数作严格性能比较。测试断言切换渲染器时 `assets.json` 和 `atlas.png` 各只请求一次；最大 JS 分包为 319,132 字节。

本机 Docker Desktop 启动时因 `sailor-ingest.sock` 绑定失败退出，本轮 Linux 验证改用独立 Ubuntu WSL 工作副本。副本来自根仓库与子模块的已提交源码，加本轮明确列出的修改，不复制 `.env`、Windows `node_modules` 或用户未提交的子模块文件。

## 独立复核

独立验证代理检查实现与测试 diff，复跑类型检查、贴图回归、生产构建和隔离浏览器像素/恢复测试，结论为 `VERDICT: PASS`。在 1,000 组固定种子的随机射线中，202 组命中方块，全部命中坐标及面法线与 Three.js 射线/包围盒求交一致。17 个实现和测试文件与最终 Ubuntu WSL 副本逐文件 SHA-256 相同。

复核发现的唯一调整是将 `Viewer3dView` 默认材质按钮的内联回调提取为 `resetResourcePack`，符合项目事件处理器规范。该调整后 Windows 再次执行 `npm run typecheck:ui`、`npm run build:ui`、`node outputs/verifier-run-textures.mjs`，退出码均为 0；Linux 再次执行 `npm run typecheck:ui`，退出码为 0。没有将这些定向验证称为又一次完整双平台回归。

复核日志为 `outputs/verifier-typecheck-final.log`、`outputs/verifier-textures.log`、`outputs/verifier-build-ui-final.log`、`outputs/verifier-browser-final.log`；Linux 最后类型检查为 `outputs/linux-acceptance/typecheck-textures-final-wsl.log`。完整复核报告 `outputs/verifier-texture-review.md` 的 SHA-256 为 `71876268b3439b1fdc4dfc1e768f134afa4b0ebeabecc271a95c5575990211a1`；最终浏览器复测日志 SHA-256 为 `fd58c1506cea8d5d0b5f03edadaff0c02576af675b549b46923e3154da39e94e`。

## 保留边界

- 用户确认 deepseek-flash 认证尚未更新；原 `MODEL_AUTH_FAILED` 证据保留，没有再次请求真实模型。
- 用户尚未准备 Minecraft/Litematica 客户端；代码与文件回读通过不能替代游戏内方块朝向、箱子 NBT、placement 验收。
- 实体预览是立方体检查器；完整方块模型由 Lodestone 模式显示。资源包预览不包含 OptiFine/CIT/着色器扩展，也不声称支持所有 Minecraft 版本的方块。
- 本轮只提交相关源码、测试与文档；fixture 换行差异、`vendor/craftmatic/src/convert/voxelizer.ts`、`.dsh-progress/` 和 `debug.log` 保留在本机。
