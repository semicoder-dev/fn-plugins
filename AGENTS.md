# 官方插件仓库

此仓库独立维护官方市场索引与插件，不属于宿主 workspace。fn 0.5 的新应用位于 `examples/cordis/`，精确消费公开 SDK 0.4.0；安装/构建不依赖相邻源码。三个 Cordis 应用 0.1.0 已公开，新市场为 `marketplace-cordis.json`（schema 2）。下述根目录旧插件与 vendor 为历史契约，不能混入新市场。公开的两个 0.1.2 插件固定消费 @semicoder/fn-sdk@0.3.4；当前开发分支按用户确认的 SVG 计划统一使用下述固定开发归档，不引用相邻源码。vendor/fn-sdk.tgz 及来源记录只保留更名阶段的历史归档，不参与当前安装。交流和文档默认中文。

开发归档：根构建工具与三个插件统一使用 `vendor/agent-sdk.tgz` 及 `agent-sdk.json` 来源哈希，包含未公开的 SVG、Agent/Chat 契约。普通安装、检查、构建不得读取相邻 fn 源码；`scripts/verify-search-host.ts <fn-source>` 是显式指定宿主的可选集成验收。发布前先验证并切换公开 SDK，不能将同版本字符串的开发归档视为公开包；正式市场仍保留已公开的两条文字图标条目。

- `plugins/translate`、`plugins/quick-notes`、`plugins/web-search` 分别管理版本；ID 是业务数据命名空间，不随意改名。
- 修改后运行 `bun run check`、`bun run test`、`bun run pack` 和 `bun run index:check`；插件必须含预构建 dist。
- Cordis 应用在 `examples/cordis/` 执行 `bun run check/test/pack` 与 `bun catalog.ts check`；`release-cordis.yml` 按 `cordis-<name>-v<version>` 发布，公开归档验收后通过 PR 更新 `marketplace-cordis.json`。
- 未公开的归档不得写入正式市场索引（包括 `marketplace.json`）。发布脚本生成候选条目，验收公开归档后通过 PR 更新索引。
- 普通开发不自动推送、打标签、发布或部署；正式标签格式为 `<plugin-id>-v<version>`。
- 发布需同步 Semicoder 插件指南和 workspace 项目笔记，记录源码、归档哈希及线上验证结果。
