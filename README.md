# Fn 官方应用

翻译、笔记、看板和模型目录以独立 TypeScript 应用交付。宿主统一模型、窗口、UI、小组件和手机文字路由；应用管理业务与 Bun SQLite 数据。四个应用使用 SDK 0.6.0 与 Fn UI 0.1.0 的精确 npm 依赖，适用于 Fn 0.7。

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run pack
bun run market:local
```

在 Fn 开发实例的应用中心添加本地市场输出的 loopback 地址，或安装各应用根目录的 `.fn.tgz`。正式市场为 `https://semicoder-dev.github.io/fn-plugins/applications.json`。Bun 1.4.4 内置构建和格式化，页面自包含 React、SDK、Fn UI。

| 应用 | 能力 |
| --- | --- |
| translate | ChatGPT 订阅 Responses 翻译、历史、计数小组件、手机翻译入口 |
| notes | 笔记编辑、搜索、持久化、冲突检查、摘要小组件 |
| kanban | 多看板、列表、拖动、卡片详情、标签、日期、检查清单与归档 |
| models-dev | models.dev API 模型目录、筛选、规格、供应商价格及离线缓存 |
| examples/stocks | 无页面后台示例，生成明确标注的模拟行情小组件；不连接真实金融数据 |

业务数据写入 host.paths.data，更新代码保留数据。所有静态文案包含 en/zh-CN，用户内容保持原文。关闭应用停止后台，最小化继续运行。

日常构建使用公开 npm 精确版本。联调未发布 SDK 时可在 Fn 构建 `bun run npm:pack` 后，运行 `bun scripts/vendor-sdk.ts <artifact-directory>`，再冻结安装并重新检查、测试和打包。归档脱离 workspace 也必须可消费。版本号不是内容摘要，开发归档不能宣称为公共 npm 的同版本包。

开发：在应用目录执行 `fn plugin dev . --browser`；应用使用真实宿主，源码变化中断当前任务并重启开发实例。小组件预览使用 `fn plugin widget widgets/summary.json --preview`。

三个官方应用的小组件固定声明 `size: "1x1"`，行情示例为 `size: "3x1"`。size 表示列数 x 行数，每个维度为 1–4，由插件决定；卡片按固定网格靠左排列，「整理桌面」支持排序和移除。预览器按照 Manifest 的固定尺寸渲染。

## 正式发布

应用独立发版，当前三个首批应用为 0.2.0，模型目录为 0.2.0，均已在正式市场提供。`bun scripts/release.ts 0.2.0 models-dev` 验证该应用归档，保留 `release/catalog.json` 中其他应用的公开地址和摘要，生成完整市场与 `release.json`。发布前若线上市场偏离基线则停止，避免覆盖并行更新。后续发版前将已验收的线上目录同步为基线。

`models-dev-v0.2.0` 等单应用标签通过 release.yml 构建、测试、打包、创建 GitHub Release，再下载核对归档与完整公开市场后部署 Pages。`apps-v<version>` 支持统一发版，要求所有应用版本一致；GitHub Pages 环境按精确标签授权。手动工作流指定 application/version 只生成候选，不发布。安装包、市场、宿主和官网依次验收，手机正式版本单独交付。
