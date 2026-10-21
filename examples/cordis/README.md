# Cordis 官方应用（fn 0.5 / SDK 0.4）

这三个应用使用 fn 0.5 的 Cordis/Bun 宿主。构建固定消费公开 `@semicoder/fn-sdk@0.4.0`，不读取相邻源码。此目录是独立 Bun workspace，旧根 workspace 与 `marketplace.json` 保留旧版发行；新市场为 `marketplace-cordis.json`。

应用版本为 0.1.0；是否已上架以新市场中的公开归档及哈希为准。

| 应用 | ID | 说明 |
| --- | --- | --- |
| 译文 | `cordis-translate` | 后端注册业务方法，指定模型连接创建 Session，页面读取持久化结果 |
| 随手记 | `cordis-quick-notes` | 页面使用应用独立 KV；后端贡献笔记数量方法 |
| 网络搜索 | `cordis-web-search` | 注册 Chat 入口，只开放 `web_search/web_fetch`，由原版 dsh Agent loop 决定调用 |

```sh
cd examples/cordis
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run pack
```

归档输出到 `artifacts/translate.tgz`、`quick-notes.tgz`、`web-search.tgz`。在 fn 0.5 应用中心手动安装；宿主会先准备候选 generation，等待模型和插件任务空闲后重启。此流程不发布包、不更新 `marketplace.json`，也不迁移旧插件数据。

创建自己的应用可用正式宿主 `fn application create ./my-app`，或开发宿主的 `fn-dev application create ./my-app`，或在 fn 源码项目中使用 `bun run agent application create <directory>`。`application check/build/pack` 对独立项目工作；新宿主不保留旧 `plugin` 命令别名。

每包的 `exports["."]` 指向 `src/index.ts`，由 Bun 执行；`exports["./client"]` 指向预构建 `dist/client.js`。后端和前端均为标准 Cordis 插件，分别注入 `app/clientApp`。React、Cordis 与 SDK UI 来自宿主共享模块；`shared/client.tsx` 仅用于本仓库构建，实际归档含完整客户端 bundle，无相邻源码依赖。删去 `./client` 即可构建无页面的纯服务包。

模型连接由用户在页面显式选择，模型列表来自宿主设置中已添加的 `models.saved`，按连接隔离。Session 固定连接，换账号创建新会话；模型任务继续在宿主运行，页面切换不取消任务。搜索与模型真实联网结果取决于已配置连接；测试覆盖作用域、RPC、工具声明与归档结构，不代表所有提供商真实认证及搜索已验收。

浏览器通过 `clientApp.list()` 汇总连接、模型和会话分页，KV 使用 SDK 自带的分页读取。发行构建使用公开精确 npm 依赖与冻结锁文件。历史 vendor 归档只作原开发验收记录，不参与发行构建。

新市场索引采用 `schemaVersion: 2`，`applications` 条目包含 id、packageName、name、description、version、HTTPS url、sha256 和精确 core 版本映射（含 `@semicoder/fn-sdk`）。`bun catalog.ts candidate` 生成候选；发布固定标签后，`bun catalog.ts promote <candidate.json>` 下载公开归档核对 SHA-256，再通过 PR 更新新市场。不得把未公开归档登记到市场，不写入旧市场。

三个示例声明 `keepAlive: true` 保留当前窗口切页草稿，并使用随包单色 SVG；关闭/重启不恢复未保存草稿。发布使用 `cordis-translate-v0.1.0`、`cordis-quick-notes-v0.1.0`、`cordis-web-search-v0.1.0` 标签，各包独立版本。
