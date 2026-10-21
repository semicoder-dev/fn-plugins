# fn 官方插件与市场

新 Cordis 应用位于 [examples/cordis](examples/cordis/README.md)，面向 fn 0.5 / SDK 0.4。新市场为 `marketplace-cordis.json`；下方旧市场/根 workspace 说明只适用于旧宿主，不将旧 manifest 插件混入新市场。

全新 Cordis/Bun 开发示例位于 [examples/cordis](examples/cordis/README.md)：译文、KV 随手记和工具搜索。它们独立消费固定开发 SDK 归档，使用 TypeScript 后端、浏览器 Cordis 页面及上游 Session；与下方旧插件分开安装和验证，未登记市场、未发布。

本仓库独立维护译文（translate）与随手记（quick-notes），宿主不携带插件，也不依赖本仓库构建。当前公开版本为 0.1.2，包名为 `@semicoder/fn-plugin-translate` 和 `@semicoder/fn-example-quick-notes`；清单字段为 `fn`，sdkVersion 保持 0.3。

另有本地开发中的[网络搜索](plugins/web-search/README.md) `web-search` 0.1.0，基于宿主 Agent loop 并接入 fn Chat。当前开发分支的三个插件和根构建工具统一使用 `vendor/agent-sdk.tgz` 固定开发归档（包含 SVG/Agent/Chat）；公开宿主/SDK 尚不支持，未加入正式市场。check/test/pack 包含该插件，生成的 `artifacts/web-search-0.1.0.tgz` 可在兼容开发宿主中手动安装。

## 独立开发

使用 Bun 1.4.3，当前根工具与三个插件均消费 `vendor/agent-sdk.tgz` 固定开发归档，不依赖相邻宿主源码；来源和哈希见 `vendor/agent-sdk.json`。公开 0.1.2 归档仍使用 npm SDK 0.3.4，与本地同版本候选内容不同。[更名阶段快照](vendor/README.md)继续保留历史。

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run pack
bun run index:check
```

`artifacts/translate-0.1.2.tgz`、`artifacts/quick-notes-0.1.2.tgz` 为本地候选归档，包含清单与完整 dist。通过 fn 应用中心从地址安装；翻译调用宿主模型，随手记使用宿主 KV。

## 市场与发布

官方索引为 `https://raw.githubusercontent.com/semicoder-dev/fn-plugins/main/marketplace.json`。`pack` 只生成候选条目与 SHA-256，不自动上架。新版本必须通过 `<plugin-id>-v<version>` 发布，公开归档验收后运行 `catalog.ts promote` 并通过 PR 更新索引；不得登记未公开文件或覆盖历史归档。

GitHub 仓库已更名为 `semicoder-dev/fn-plugins`，remote 与 About 已同步。SDK 0.3.4 的公开归档、实际 OIDC 与独立消费已先验收，两个 0.1.2 插件随后发行。Actions 无法创建 PR 时，维护者从生成的 catalog 分支补建，CI 通过后合并；不放宽仓库保护。

## fn 首次发行（2026-10-15）

- [译文 0.1.2](https://github.com/semicoder-dev/fn-plugins/releases/tag/translate-v0.1.2)：来源 `e6eebdac3f30ece19bd12ca5f336a91651ddcead`，[流程 38690288648](https://github.com/semicoder-dev/fn-plugins/actions/runs/38690288648) 成功；42,733 字节，SHA-256 `73dc775fb7e5b5d2125c1d01ed79f9a854bc8c6e54f6695cea421f17921bc938`。
- [随手记 0.1.2](https://github.com/semicoder-dev/fn-plugins/releases/tag/quick-notes-v0.1.2)：来源 `11f6b6814166f8ff147a8145031f8052616122ef`，[流程 38690554518](https://github.com/semicoder-dev/fn-plugins/actions/runs/38690554518) 成功；4,588 字节，SHA-256 `ba05a8bba6c35de9b32a488d55bbdf9e928e5aea5b780fdbdc6964080ffdccff`。
- 两个 Release 各三个附件匿名校验大小与摘要，包名、fn 清单、ID、版本、完整 dist 和新运行时标识均通过。本地 check/test/pack/index:check 及新缓存独立源码安装/check/pack/index:check 通过，固定公开 SDK 0.3.4，不依赖相邻目录。
- 市场 PR [#8](https://github.com/semicoder-dev/fn-plugins/pull/8) / [#9](https://github.com/semicoder-dev/fn-plugins/pull/9) 经 CI 合并，索引提交 `7a47ae1`。公开索引与验收候选条目一致；未登记旧归档或未公开版本。
- 公开 fn 0.4.4 全新实例从市场安装两个插件，均 active；页面、KV 保存/刷新、正常退出与重启持久化通过。fn Dev 使用公开译文归档和用户已授权的 GPT-6-Luna 完成真实调用，demo:false。官网按同批产物同步并单独部署验收。

## 历史发行证据（原包名与地址）

以下历史标签与归档保持不变，不代表 fn 已发布。

## 组织首次发行（2026-10-11）

源码 `a6a949134703b6c88d43641261888bd75a1a5d97`。翻译 [工作流 38117624321](https://github.com/semicoder-dev/malatang-plugins/actions/runs/38117624321)、随手记 [工作流 38117627294](https://github.com/semicoder-dev/malatang-plugins/actions/runs/38117627294) 成功；公开归档的 SHA-256、包身份、版本和预构建文件经独立下载验收。固定 SDK 0.3.2 已先完成 npm OIDC 与公开归档验收。

- [翻译 0.1.1](https://github.com/semicoder-dev/malatang-plugins/releases/tag/translate-v0.1.1)：SHA-256 `d42181bd290f938170dd7209dd6358f731017c6ac5e05cafaa4262e706a45077`。
- [随手记 0.1.1](https://github.com/semicoder-dev/malatang-plugins/releases/tag/quick-notes-v0.1.1)：SHA-256 `fcfd8422211093d17fa9cdcc7ced2a06785cc93bcea28337ee9c877b41916da6`。
- 索引 PR [#5](https://github.com/semicoder-dev/malatang-plugins/pull/5) / [#6](https://github.com/semicoder-dev/malatang-plugins/pull/6) 经 CI 后合并，固定索引提交 `050e08736bed8462b6c4881bde63d4625ceb640d`；公开 Raw 返回两个 0.1.1 条目。旧标签与归档保持不变。

## 首次上线证据（2026-10-11，历史）

- 翻译 [translate-v0.1.0](https://github.com/semicoder-dev/malatang-plugins/releases/tag/translate-v0.1.0)，源码 `1d65444`，SHA-256 `47f1ca96ba81a367944c4f01823e25dd960f3465d18f056e6573def05ac8d833`。
- 随手记 [quick-notes-v0.1.0](https://github.com/semicoder-dev/malatang-plugins/releases/tag/quick-notes-v0.1.0)，源码 `a377f30`，SHA-256 `14b55f3722be87a3674cb7bdf0c41408cd8fbe1808de57cdf8dfc6d329cb56e0`。
- 两个归档经匿名下载、包身份和哈希验收；索引 PR [#1](https://github.com/semicoder-dev/malatang-plugins/pull/1)、[#2](https://github.com/semicoder-dev/malatang-plugins/pull/2) 经 CI 后合并，公开 Raw 索引已返回两条记录。
- 首次翻译流程在归档发布后因 Actions 无 PR 创建权限而报错；维护者补建 PR，标签与归档未移动。工作流此后保留候选分支并明确提示手工补建 PR，仓库保护未放宽。

## SVG 图标开发（未发布）

三个插件的 `src/icon.svg` 分别提供翻译、笔记和网络搜索造型；`fn.iconSvg: "dist/icon.svg"` 由 SDK 自动构建，`icon` 文字仍作加载失败回退及 fn Chat 图标。宿主用单色 mask 跟随前景色，应用中心保留原插件底色。

pack 从 dist 读取 SVG 生成候选条目的 `iconSvg` 内容字段；公开 marketplace.json 不改动。图标最多 8 KiB，源和产物都不能越出插件目录。公开宿主不识别此字段，本地候选须安装到本次开发宿主；发行前需发布并独立验收兼容 SDK/宿主、为插件选择新版本，再更新正式索引，不能覆盖已有 0.1.2 公开归档。
