# Typocket

Typocket 是 DSH 中的个人文档工具，方便你阅读 Agent 的工作成果，继续编辑 Markdown，并将有用的资料整理为本机抽屉。PDF 和 HTML 页面也可一起预览。插件安装包包含完整网页和本机服务。启用插件后自动启动，无需另装 Typocket、Node.js 或运行终端命令。

## 安装

1. 在 [DSH 社区插件市场](https://awesome-dsh-plugin.com/?q=Typocket)搜索 Typocket 并安装。手动安装时，从 [GitHub 发布页](https://github.com/bigricedumpling/deepseek-reader/releases)下载所需版本的 `.tgz`，在 DSH NEXT 的「插件 → 添加插件」中选择该文件。
2. 在右侧栏「开始」页点击「Typocket」。首次使用会自动创建本机数据目录。
3. 在 DSH 文件区打开 Markdown，可用 Typocket 预览；在 Typocket 顶栏点外部打开图标，可在浏览器打开当前页面。

## 本机数据

macOS 默认抽屉目录是 `~/Library/Application Support/Reader/知识库`。它不在插件安装目录中，更新或卸载插件不会删除文档。本机服务只监听回环地址，并会保存首次分配的端口供重启复用。

如果本机 `127.0.0.1:8090` 已有旧 Typocket，插件会先接入它，以保留此前的抽屉体验；旧服务离线时会提示离线，避免切换到另一份空库。迁移旧目录前请先备份。需要沿用原目录的高级用户可在启动 DSH 前设置 `DSH_READER_DATA_DIR`，插件不会自行移动旧数据。在插件详情中可手动连接另一台 Typocket；远程地址需使用 HTTPS。

## 工作区 Markdown 与 Agent

工作区 Markdown 预览只读。相对链接继续打开工作区文件，相对图片从当前工作区读取；预览不会移动原文件。想保留时在预览页直接「收进抽屉」，生成抽屉中的独立副本；不收录就不保留浏览记录。Typocket 不提供公开分享或云端发布。

阅读器与 Markdown 预览安装后即可用。Agent 直接读写抽屉里的本地文件，不需要单独授权、令牌或环境变量。通过 Typocket 接口写入时会检查版本；直接改磁盘不会进入「Agent 改动」。插件随包提供 `skills/reader-workspace/SKILL.md`，说明抽屉的目录约定、写入边界和资源规则。

## 支持范围与已知问题

- 插件面向 macOS、Windows 和 Linux。macOS 已验证 DSH NEXT 的安装链。Windows 和 Linux 的原生 DSH 安装与桌面交互仍待验收。
- Agent 直接使用本地文件，不需要单独授权；Typocket 不提供公开分享或云端发布。
- 单篇内容交付使用导出；导出不会随后续编辑自动更新。
- 工作区文件与抽屉副本独立，不提供双向同步或多人协作。
- 在 macOS DSH NEXT 的两个原生窗口中可以同时打开同一个抽屉。两处写入冲突时可另存副本；卸载插件后原文和副本继续留在本机。

源代码采用 [MIT License](LICENSE)。字体、PDF 阅读组件和图标的来源与许可见[第三方资产](https://github.com/bigricedumpling/deepseek-reader/blob/main/docs/THIRD-PARTY-ASSETS.md)。
