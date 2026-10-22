# 固定开发契约

`manifest.json` 记录来源仓库、完整 commit、包版本、源码路径和归档 SHA-256。当前固定 fn `2d67742`（全插件化候选），不是公开同版本包。`scripts/check.ts` 验证每个归档的哈希；Bun lock 固定其完整开发依赖闭包。

归档制作从上述已提交版本对应目录复制 `src`、已有 `dist`、构建工具和 README，按实际 workspace 版本替换 `workspace:*`，移除开发依赖、scripts、bin、files 字段，再生成 npm 格式 `package/` tarball。FIA 不复制 assets/原生运行时。源码内容不修改；这些归档只用于独立插件开发，不能当成新版 FIA/SDK 的正式发行。

更新需显式重新取源、验收并更换文件名与清单，禁止用同路径覆盖归档后复用 Bun 缓存。日常安装、类型检查、构建和打包仅消费本目录，不访问相邻 fn 源码；看板发行包不会包含 vendor、node_modules 或宿主实现。
