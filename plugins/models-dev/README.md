# 模型目录

适用于 Fn 0.7 应用平台的插件，精确消费公开 SDK 0.6.0、Fn UI 0.1.0。通过 `https://models.dev/catalog.json?type=all` 获取规范模型、供应商及报价，不需要 API Key。

支持名称/ID 搜索、机构/类型/输入模态/能力筛选、排序和分页；模型详情显示上下文、输出上限、能力及供应商报价。基础价格为美元/百万 token，缺失值显示 `—`，零价格保留；阶梯和额外费用保留上游原始字段供查阅。数据源为 [models.dev](https://models.dev/models/)，实际收费以供应商为准。

页面通过 Fn SDK 的 `list`、`detail`、`refresh` 方法调用独立 Bun 后台。后台通过 HTTPS 查询上游，按需一小时刷新，在 `host.paths.cache/catalog-v1.json` 保存原子缓存；失败保留最近有效数据并提示过期，首次离线显示错误并可重试。关闭应用取消网络；最小化保留进程。该目录仅供查阅，不自动添加模型连接或调用供应商模型。

在本仓根目录执行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run pack
bun run market:local
```

在隔离 Fn 开发实例安装 `plugins/models-dev/fn-models-dev-0.2.1.fn.tgz`，或添加本地市场。发行标签为 `models-dev-v0.2.1`，普通构建不修改生产市场；正式归档与市场状态以发行验收记录为准。使用时从应用中心刷新官方市场并安装「模型目录」，无需升级 Fn 或配置 API Key。
