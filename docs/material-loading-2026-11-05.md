# 材质加载提速验收（2026-11-05）

基线为 `63dfc8b`。生产静态服务原样传输脚本和 1,576,648 字节的材质 JSON，限速冷启动主要等待资源下载。本轮在 `npm run build:ui` 中生成 Brotli/Gzip 文件，服务按 `Accept-Encoding` 返回已有压缩文件；解压后的资源内容、图集 PNG、模型和画质保持一致。

## 实现与回归

- 压缩发生在构建时，最多同时处理 4 个文件；只处理大于等于 1 KiB 的可压缩文本/脚本/WASM，压缩不缩小的文件继续使用原文件。未压缩 PNG、未降低图集分辨率。
- 服务尊重编码权重及 `q=0`，提供 `Vary: Accept-Encoding`、准确的内容类型/长度和 HEAD 响应；压缩文件缺失或早于源文件时使用原文件。客户端明确拒绝全部可用编码时返回 406。
- 无额外运行依赖。压缩步骤直接加入构建命令，兼容 npm/pnpm；原始文件可继续由其他静态服务器读取。
- 新增 `npm run test:static-assets`，先验证旧服务失败（`undefined !== 'br'`），再验证真实材质 JSON 与夹具的 Brotli/Gzip 解压一致、权重/拒绝协商、小文件、PNG、旧压缩文件、HEAD、缺失文件和路径越界。
- 测量脚本记录浏览器实际传输大小、压缩后大小与解码大小；`--measure-only` 用于独立性能采样，完整 `npm run verify` 仍执行全部恢复和浏览器测试。

## 同条件三次冷启动

Windows / Node 26.9.0 / Chromium 153.0.8010.12，1440×900，下载 1.5 Mbps、延迟 40 ms、每次独立浏览器上下文且禁用缓存。先完成旧服务三次测量，再完成新服务三次；采样期间没有并行构建或其他本轮回归。每次都等待材质及真实模型网格构建完成后记录就绪。

| 指标 | 优化前中位数 | 优化后中位数 |
| --- | ---: | ---: |
| 输入控件可用 | 2.324 秒 | 1.165 秒 |
| 材质预览就绪 | 23.218 秒 | 11.075 秒 |
| 首次切换实体预览 | 2.155 秒 | 2.002 秒 |
| 初始已请求脚本/样式/材质正文传输量 | 4,146,468 字节 | 1,857,215 字节 |
| `assets.json` 实际压缩正文 | 1,576,648 字节 | 107,301 字节 |
| `atlas.png` 正文 | 1,466,253 字节 | 1,466,253 字节 |

材质就绪耗时降低 52.3%。PNG 现在是主要下载等待；没有把这次网络传输优化称为网格算法优化。脚本解码总量仍为 1,030,887 字节，最大 JS 分包仍为 319,132 字节。其他托管服务若忽略旁路压缩文件，须自行配置压缩后才能获得相同收益；以上为本机 headless 实测，不代表托管 Codespaces 或公网性能。

复现采样（先执行 `npm run build:ui`）：

```powershell
$env:CRAFTAIB_LOADING_REPORT='outputs/material-loading/sample.json'
$env:CRAFTAIB_LOADING_SAMPLES='3'
node scripts/renderer-loading-smoke.mjs --measure-only
```

## 最终功能验证与新克隆

最终实现分别在 Windows / Node 26.9.0 与 Ubuntu 24.04 / WSL2 / Node 24.22.2 / pnpm 11.23.0 执行完整 `npm run verify`，退出码均为 0。包含引擎/Worker/CLI/服务端、结构与存储、贴图、8 项工具链测试、2 项压缩静态服务测试、类型检查、生产构建和 11 组浏览器套件。

Windows 像素报告为不透明材质 7,395 像素、透明裁切 3,761 像素、默认图集改变 0 像素；7 类坏包拒绝/恢复、默认材质恢复、重新上传及 HTTP/PNG 解码重试均通过，页面错误和已知方块外部贴图请求均为 0。报告哈希与前一轮完全相同。

Linux 从 GitHub 执行 `git clone --branch dev --recurse-submodules`，得到 `63dfc8b` 及固定的三个子模块，再仅应用本轮 7 个实现/测试文件。没有复制 `.env`、Windows 依赖或原工作区未提交的 vendor 文件；执行 `pnpm install --frozen-lockfile --ignore-scripts` 后完成完整验证。它是隔离的新设备流程复现，没有声称已经操作用户的另一台物理设备。

新克隆另执行实际 `npm start`（`PORT=0` 使用独立端口），确认构建后服务启动，首页、Worker、材质 JSON、图集 PNG 均返回 200；解压后的字节与构建文件完全一致。模型配置返回未设置，测试没有发起真实模型请求。验证后只停止本次启动的进程组。

安装浏览器系统依赖时，当前 WSL 的 nginx.org/Ubuntu 软件源曾经返回代理 502，`--with-deps` 退出 100，失败日志保留。该环境的系统库已具备，后续 `pnpm exec playwright-core install chromium --only-shell` 与完整浏览器验证通过；没有修改系统软件源，也没有把现有 WSL 称为全新操作系统镜像。

最终全量回归期间的性能采样与上面的独立三次测量分开：Windows 13.874 秒、Linux 11.441 秒，仅作为功能就绪检查，不能替代独立中位数。

## 原始证据

日志和截图保留在旧设备 `outputs/`，不进入 Git；新设备可以重跑上述命令。现存证据 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `material-loading/before.json` | `51f58b255b7139ed1f99317e0c49fa218313bad743da9ba866f6b581518b1406` |
| `material-loading/after.json` | `caa071962ff8b05aa0216692d19f0118d157512dfb72a6a5cb32dd6c650907b7` |
| `windows-verify-material-loading-final.log` | `a4fa8574a41e3f7fcfa2f0913ee2f1b7b87ec7915bd8bd015c8d1e3609472c45` |
| `linux-acceptance/verify-material-loading.log` | `44bf76b738b77a628c849fc670b4a5d6e873179235721edced3072314d0dadf1` |
| `linux-acceptance/npm-start-material-loading.json` | `409befa5834fbc442cbcf33c9fc41b13986b8804d7eebd3b0028efc30a030534` |
| `material-loading/windows-textures-final/texture-acceptance.json` | `214b5da99a9d4c40a7b7eac7817a0975841f84b12fb3dc9fc61962a4c2bff327` |

早于本轮的真实模型认证失败证据继续保留，用户尚未更新认证；Minecraft/Litematica 客户端仍未准备。本轮没有重试真实生成，也未将游戏内验收标记通过。游戏包和操作说明继续使用 `npm run acceptance:client` 重建。
