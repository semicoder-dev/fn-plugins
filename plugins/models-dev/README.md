# 模型目录 · models.dev

`@semicoder/fn-models-dev` 0.1.1，适用于 fn 0.6 / SDK 0.5；不适用于 fn 0.5.2。无需模型账号或 API Key。

0.1.1 统一价格详情弹窗的段落和价格分组间距，保留现有目录缓存、API 与价格展示规则。

通过官方 `https://models.dev/catalog.json?type=all` 获取模型信息，以 canonical model 为列表单位；供应方案按上游规则依次匹配有效的 `canonical_model_id`、完整模型 ID、供应商 ID/模型 ID，不靠名称猜测。覆盖 API 返回的全部类型，包括对话、图像、视频、嵌入等。

- 侧栏“模型目录”：按名称、ID、描述搜索，筛选开发机构、类型、输入模态、推理/工具调用/开放权重；排序与每页 50 项分页。
- 点击模型进入详情，查看规格、能力与供应商模型 ID、基础输入/输出/缓存价格。价格单位为美元/百万 token；缺失为“—”，零价保持为 0。价格详情保留 API 的阶梯和其他价格字段，最终计费以供应商文档为准。
- 目录按需加载，缓存一小时；“刷新”主动联网。失败保留旧缓存并标注同步时间和错误；没有缓存时显示错误和重试。后端限制 20 秒和 24 MiB，并合并并发请求；失败自动重试间隔一分钟。
- 缓存位于宿主数据目录 `fn-models-dev/catalog-v1.json`，卸载不删除。插件卸载会取消在途网络请求。

这是模型信息浏览器，不生成内容、不读取凭证、不自动建立连接或添加模型到 Chat。使用 fn-ui 原版组件和宿主主题，没有 iframe 或网页抓取。

## 构建与安装

在本仓库根执行 `bun run check`、`bun run test`、`bun run pack`。输出 `artifacts/semicoder-fn-models-dev-0.1.1.tgz`；在开发宿主“应用中心 → 从地址安装”填入归档的本机绝对路径，等待新组合激活。重新构建后须通过插件管理更新，不能原地覆盖安装目录。正式安装可从 fn 0.6 官方应用中心选择「模型目录」。

## 插件 API

浏览器安全契约导出为 `@semicoder/fn-models-dev/contract`。安装启用后动态注册命名空间 `modelsDev`，前端通过 `client(ctx, "modelsDev", contract)` 访问：

- `list({ search?, lab?, type?, input?, capability?, sort?, direction?, offset?, limit? })`：返回 `items/total/nextOffset` 及可筛选值。limit 1–100；capability 为 reasoning/tool_call/open_weights；sort 为 release/name/lab/providers/context/output；direction 为 asc/desc。
- `detail({ id })`：返回模型和关联的供应商方案。
- `refresh({})`：强制刷新共享缓存。

三者均返回 `fetchedAt`（本机同步时间的毫秒时间戳）、`stale` 和 `warning`。供应方案数量包含同供应商的不同模型 ID，与 models.dev Models 详情页一致；开发机构使用 canonical ID 的首段。原站数据会变化，缓存时间不是模型发布日期。当前命名空间和侧栏入口固定，组合中只启用一个实例。

官方来源：[Models](https://models.dev/models/) · [目录 API](https://models.dev/catalog.json?type=all) · [上游项目](https://github.com/anomalyco/models.dev)。独立实现 fn 页面，不复制上游网站源码或静态模型快照。
