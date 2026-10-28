# fn 官方插件市场

首个正式应用是 [看板](plugins/kanban/README.md)：`fn-kanban` / `@semicoder/fn-kanban`，初始候选版本 0.1.0。它是完整的双端 Cordis 插件，使用自己的 SQLite 保存本地看板，通过原版 Slots 提供页面。无需模型或云账号。

适用宿主为 fn `codex/all-plugins` 的全插件化候选（基线 `2d67742`），**不适用于公开 fn 0.5.2 / SDK 0.4.0 的旧契约**。本仓库使用 `vendor/manifest.json` 固定的开发归档和锁文件，安装/构建不读取相邻 fn 源码。归档是开发契约快照，不是同版本公开包；FIA 归档不含原生 Host/Bun，不能用来发行应用。

UI 统一从 `@semicoder/fn-ui` 使用原版 dsh 控件和宿主主题，精确声明 peer；SDK 不再导出 UI。看板使用 CSS Modules、语义 token 和共享 Menu/Modal，不携带另一套控件、React 或主题。`check` 同时阻止旧 UI 依赖、token 和替代控件回流。当前归档包含基线之后的 UI 迁移，具体字节由 manifest 中 SHA-256 固定，基线 commit 不能替代归档哈希。

生产候选索引 `marketplace.json` 仍为空，只有正式发布并验证归档后才登记。`market:local` 使用真实看板包生成独立的 HTTPS 验收市场。翻译、随手记和网络搜索测试插件保持删除；历史标签与已发布附件保留。

新插件使用普通 npm Cordis 契约，自有包名为 `@semicoder/fn-<能力名>`。插件实例 ID 由 profile 配置，不等同于包名。后端、前端和双端插件均可发布；前端通过原版 dsh Slots 贡献界面。验证后的新插件再按独立发布流程登记，不允许将测试夹具上架。

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run pack
# 输出 artifacts/semicoder-fn-kanban-0.1.0.tgz
# 在全插件化候选宿主“应用中心 → 从地址安装”中填写归档绝对路径。
```

本地市场验收使用 `bun run market:local --cert <localhost-cert.pem> --key <key.pem>`，将输出的 HTTPS 地址添加到隔离开发宿主。证书必须被该验收进程信任；不要关闭 TLS 验证或提交私钥。源文件、构建包和安装目录分开，重新打包后通过市场更新或地址更新加载。

日常 fn Dev 的源码监听只更新宿主及默认组合，不自动替换独立安装的看板。开发归档即使仍标为 0.1.0，内容也可能不同；重新 `pack` 后，在“已安装”中更新原记录，等待后台重启。交付验收应核对已安装 `dist/client.js` 与本轮归档的 SHA-256，并验证数据保留；隔离宿主安装通过不代表日常 Dev 已使用新包。

此次没有推送或部署。线上 fn 0.5.2 仍使用既有 `marketplace-cordis.json`，本地清理不代表生产市场已变更。后续发布须协调宿主、市场与官网，先验归档再更新索引，不删除历史发布资产。
