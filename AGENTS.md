# 官方插件市场

当前为 fn 0.6 的 schema 3 官方市场，提供看板和模型目录。首个应用为 `plugins/kanban`（看板 / fn-kanban）。此前三个测试插件和旧实现保持删除。本仓库独立消费公开 SDK 0.5.0 与 `vendor/manifest.json` 固定宿主契约，不依赖相邻宿主构建。自有 npm 包统一命名 `@semicoder/fn-<能力名>`；不使用 fn-cordis 前缀。

修改插件运行 `bun run check`、`bun run test`、`bun run pack`，并在隔离候选宿主验证安装和实际交互。业务数据由插件持有，不恢复旧全局 KV。未公开归档与测试夹具不得登记到生产索引；本机 HTTPS 候选市场只用于验收。普通开发不推送、发版或部署。历史标签和附件保留，生产市场变更需后续明确授权；官网与知识库同步记录本地候选和线上状态。

UI 使用宿主共享的 @semicoder/fn-ui 原版 dsh 控件与主题，包中声明 peer。页面只写 CSS Modules 和语义 token，不能写全局控件规则或打包 UI/React 副本；不新增 Base UI、Tailwind 或旧 SDK UI。业务标签颜色属于看板数据，可保留有语义的独立色板。菜单、弹窗、键盘与明暗必须实际验收。
