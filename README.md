# fn 官方插件市场

新增 [模型目录](plugins/models-dev/README.md)（`@semicoder/fn-models-dev` 0.1.0）：通过 models.dev 官方 API 浏览模型规格、筛选排序和供应商价格，缓存支持离线查看。

首个正式应用是 [看板](plugins/kanban/README.md)：`fn-kanban` / `@semicoder/fn-kanban`，版本 0.1.0。它是完整的双端 Cordis 插件，使用自己的 SQLite 保存本地看板，通过原版 Slots 提供页面。无需模型或云账号。

适用宿主为 **fn 0.6.0 / SDK 0.5.0**，不兼容 fn 0.5.2 / SDK 0.4.0 的旧契约。SDK 精确消费公开 npm 0.5.0；其他尚未独立发布的宿主契约由 `vendor/manifest.json` 固定归档和锁文件提供，安装/构建不读取相邻 fn 源码。固定归档不能用同版本 npm 包替代；FIA 类型归档不含原生 Host/Bun，不能用来发行应用。

UI 统一从 `@semicoder/fn-ui` 使用原版 dsh 控件和宿主主题，精确声明 peer；SDK 不再导出 UI。看板使用 CSS Modules、语义 token 和共享 Menu/Modal，不携带另一套控件、React 或主题。`check` 同时阻止旧 UI 依赖、token 和替代控件回流。当前固定契约从 fn `8e255e5` 的默认构建 seed 统一导出，转换规则与 SHA-256 记录于 manifest；不包含 FIA 原生发行资产。

正式索引 `marketplace.json` 使用 schema 3，只有正式发布并验证归档后才登记。`market:local` 使用真实看板包生成独立的 HTTPS 验收市场。翻译、随手记和网络搜索测试插件保持删除；历史标签与已发布附件保留。

新插件使用普通 npm Cordis 契约，自有包名为 `@semicoder/fn-<能力名>`。插件实例 ID 由 profile 配置，不等同于包名。后端、前端和双端插件均可发布；前端通过原版 dsh Slots 贡献界面。验证后的新插件再按独立发布流程登记，不允许将测试夹具上架。

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run pack
# 输出 artifacts/semicoder-fn-kanban-0.1.0.tgz
# 以及 artifacts/semicoder-fn-models-dev-0.1.0.tgz
# 在fn 0.6 宿主“应用中心 → 从地址安装”中填写归档绝对路径。
```

本地市场验收使用 `bun run market:local --cert <localhost-cert.pem> --key <key.pem>`，将输出的 HTTPS 地址添加到隔离开发宿主。证书必须被该验收进程信任；不要关闭 TLS 验证或提交私钥。源文件、构建包和安装目录分开，重新打包后通过市场更新或地址更新加载。

日常 fn Dev 的源码监听只更新宿主及默认组合，不自动替换独立安装的看板。开发归档即使仍标为 0.1.0，内容也可能不同；重新 `pack` 后，在“已安装”中更新原记录，等待后台重启。交付验收应核对已安装 `dist/client.js` 与本轮归档的 SHA-256，并验证数据保留；隔离宿主安装通过不代表日常 Dev 已使用新包。

历史 `marketplace-cordis.json` 原样保留给 fn 0.5.x，历史标签和附件不改动。新版不安装旧插件；每次发布先验公开归档再更新索引，并同步官网。
