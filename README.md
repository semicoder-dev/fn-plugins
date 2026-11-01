# Fn 官方应用

翻译、笔记、看板和模型目录以独立 TypeScript 应用交付。宿主统一模型、窗口、UI、应用摘要和手机文字路由；应用管理业务与 Bun SQLite 数据。0.3.0 使用 Fn 0.8 的 hostApi 2、SDK 0.7.0 和 UI 0.2.0。宿主构建不依赖本仓。

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
| translate | ChatGPT 订阅 Responses 翻译、历史、最近译文摘要、手机翻译入口 |
| notes | 笔记编辑、搜索、持久化、冲突检查、数量与最近内容摘要 |
| kanban | 多看板、列表、拖动、卡片详情、标签、日期、检查清单与归档 |
| models-dev | models.dev API 模型目录、筛选、规格、供应商价格及离线缓存 |
| examples/stocks | 无页面后台示例，生成明确标注的模拟行情应用摘要；不连接真实金融数据 |

业务数据写入 host.paths.data，更新代码保留数据。所有静态文案包含 en/zh-CN，用户内容保持原文。关闭应用停止后台，最小化继续运行。

正式发行精确依赖公开 npm SDK/UI，不使用 overrides 或本地路径。开发联调可以在 Fn 构建 `bun run npm:pack` 后运行 `bun scripts/vendor-sdk.ts <artifact-directory>`，但发布前必须恢复公开版本和冻结锁文件。版本号不是内容摘要。

开发：在应用目录执行 `fn plugin dev . --browser`；应用使用真实宿主，源码变化中断当前任务并重启开发实例。应用摘要预览使用 `fn plugin summary summary/initial.json --preview`。


每个应用只有一份结构化摘要，不声明尺寸或嵌套布局。后台 setSummary 更新内容，notifyDataChanged 独立通知页面；应用关闭后保留最后摘要。

## 应用列表候选验收（2026-11-01）

以下为发布前候选验证：hostApi 2 已通过 check、28 测试/129 断言、四应用和行情示例打包，以及仓库外冻结安装/检查/测试/打包。当时 SDK/UI 来源固定在本地归档清单，不是同版本公开 npm 产物；发行准备已切换精确公开依赖。笔记与看板真实窗口写入、双视图通知、行情持续摘要、关闭/重启缓存和替换包后业务数据保留已在独立 Fn List QA 验证。翻译使用受控模型响应测试，摘要失败不影响已提交的业务成功。候选验证后已发布 0.3.0：`apps-v0.3.0` / `d310e61`，正式流程 41277635044、匿名四包/市场与 CI 一致性、公开 Fn 0.8 真实应用中心升级及数据保留通过。发行使用精确公开 SDK 0.7.0/UI 0.2.0，全仓 29 测试/134 断言；未替换日常应用。

## GitHub CI/CD

PR、main 和手动 CI 执行检查、测试、四应用及行情打包、`scripts/verify-independent.ts` 仓库外冻结消费。发布流程额外运行 `scripts/check-release-dependencies.ts`，拒绝本地 SDK/UI 及 overrides；版本/tag 校验后生成归档和市场。只有推送精确发行标签才发布，手动执行仅构建候选。公开归档校验通过后切换 Pages，已有归档不覆盖，未更新应用条目保持。环境采用精确标签许可和现有审核。
