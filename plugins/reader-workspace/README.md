# Reader · DSH 插件 Preview

Reader 在 DSH 右侧栏提供本机知识库阅读、编辑，以及工作区 Markdown 预览。插件安装包包含完整网页和本机服务。启用插件后自动启动，无需另装 Reader、Node.js 或运行终端命令。

> 本目录当前为 0.2.0-preview.1 开发代码，尚未发布。以下下载步骤安装的是 preview.2。

## 安装

1. 从 [Preview 发布页](https://github.com/bigricedumpling/deepseek-reader/releases/tag/v0.1.0-preview.2)下载 `dsh-reader-workspace-0.1.0-preview.2.tgz`，在 DSH NEXT 的「插件 → 添加插件」选择这个文件。
2. 在右侧栏「开始」页点击「阅读器」。首次使用会自动创建本机数据目录。
3. 在 DSH 文件区打开 Markdown，可用 Reader 预览；在 Reader 顶栏点外部打开图标，可在浏览器打开当前页面。

社区市场审核通过后，才可在市场中搜索安装。审核状态以市场页面为准。

## 本机数据

默认知识库目录是 `~/Library/Application Support/Reader/知识库`。它不在插件安装目录中，更新或卸载插件不会删除文档。本机服务只监听回环地址。开发中的 0.2.0-preview.1 会保存首次分配的端口并在重启后复用。

如果本机 `127.0.0.1:8090` 已有旧 Reader，插件会先接入它，以保留此前的知识库体验；公开 preview.2 在旧服务关闭后会自动使用随包服务；开发中的 0.2 分支已改为保留原连接并提示离线，避免切换到另一份空库。迁移旧目录前请先备份。需要沿用原目录的高级用户可在启动 DSH 前设置 `DSH_READER_DATA_DIR`，插件不会自行移动旧数据。在插件详情中可手动连接另一台 Reader；远程地址需使用 HTTPS。

## 工作区 Markdown 与 Agent

工作区 Markdown 预览只读。相对链接继续打开工作区文件，相对图片从当前工作区读取；预览不会移动原文件。本机预览历史保存在「工作区浏览记录」，可选择收录为知识库中的独立副本。访客分享采用只读快照，手动更新才替换快照；这不是多人协作编辑。

阅读器与 Markdown 预览安装后即可用。Agent 查找和写入知识库是可选高级功能：在 Reader 的「管理知识库 → 插件连接」生成限范围令牌，再给 DSH 启动环境设置 `READER_URL`、`READER_TOKEN` 并重启。未配置令牌时，不注册会失败的 Agent 工具。令牌不要写进仓库。

本目录还保留 MCP stdio 适配器：`node scripts/reader.mjs --stdio`。它同样需要用户单独授权令牌。

## 支持范围与已知问题

- 已公开的 preview.2 面向 macOS 本机 DSH NEXT。已用 DSH NEXT 2.0.16-next（内含 DSH 0.2.0-rc.1）及全新 DSH Web profile 验证安装包自动启动和阅读器入口。新分支增加 Windows/Linux 安装与路径支持，仍待真实 DSH 桌面验收；iOS 不作为 DSH 插件平台。
- Agent 工具仍需单独授权；客户端连接地址不会自动配置 Agent 令牌。
- 临时访客链接依赖 `cloudflared` 与网络；真实外部设备的端到端连通性尚未完成验收。
- 工作区预览是快照，收录后为独立副本，不提供双向同步或多人协作。
- 两个独立 DSH 实例同时访问同一个本机数据目录的完整操作尚未验收。

MIT License，详见 [LICENSE](LICENSE)。
