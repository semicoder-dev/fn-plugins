# 官方插件市场

当前候选为全插件化 fn 的 schema 3 市场，首个正式应用为 `plugins/kanban`（看板 / fn-kanban）。此前三个测试插件和旧实现保持删除。本仓库独立消费 `vendor/manifest.json` 固定开发契约，不依赖相邻宿主构建。自有 npm 包统一命名 `@semicoder/fn-<能力名>`；不使用 fn-cordis 前缀。

修改插件运行 `bun run check`、`bun run test`、`bun run pack`，并在隔离候选宿主验证安装和实际交互。业务数据由插件持有，不恢复旧全局 KV。未公开归档与测试夹具不得登记到生产索引；本机 HTTPS 候选市场只用于验收。普通开发不推送、发版或部署。历史标签和附件保留，生产市场变更需后续明确授权；官网与知识库同步记录本地候选和线上状态。
