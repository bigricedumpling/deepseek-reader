# Reader

**在 DSH 中阅读、编辑和整理你与 Agent 共同积累的资料。**

一次调研往往会留下笔记、草稿、参考文献和网页。Agent 很擅长处理这些文件，人却需要一个适合阅读、修改和整理它们的地方。Reader 把这个界面带到 DSH 中，让工作区里的成果逐渐成为可以反复使用的个人知识库。

正文以普通文件保存在本机。你可以在 Reader 中继续写，也可以交给 Agent 或其他工具处理。Markdown 是主要写作格式，PDF 和 HTML 页面也能放在一起查看。

## 可以用它做什么

- **阅读工作区成果**：直接预览 Agent 生成的 Markdown，查看相对图片和链接，从工作区浏览记录中找回读过的文件。
- **整理自己的知识库**：将有用的资料收录为独立副本，用文件夹组织内容，通过搜索和多标签继续工作。
- **专注阅读与写作**：调整字体、正文宽度、行距和主题，使用目录导航，编辑 Markdown、表格、公式与脚注。
- **一起查看不同资料**：在同一处阅读 Markdown、PDF 和 HTML 页面，适合调研、学习、项目记录与个人笔记。
- **按需连接 Agent 和分享**：授权 Agent 访问指定知识库，或为选定内容创建只读分享快照。

Reader 面向以本地文件为中心的个人工作。当前不提供多人实时协作、云同步或工作区原文件与收录副本的双向同步。

## 安装

1. 从 [发布页](https://github.com/bigricedumpling/deepseek-reader/releases)下载最新 Preview 的 `.tgz` 安装包。
2. 在 DSH NEXT 中打开「插件 → 添加插件」，选择安装包。
3. 从右侧栏「开始 → 阅读器」进入。

**插件自带 Reader 页面和本机服务，无需另外部署 Reader、安装 Node.js 或运行终端命令。**首次使用会创建「草稿」知识库，你可以改名或删除它。

社区市场收录仍在审核中，当前请使用发布页安装包。macOS 已验证安装与本机使用；Windows 和 Linux 已包含平台适配并通过自动检查，但原生 DSH 桌面体验仍待验证。具体边界见 [支持范围与已知问题](docs/RELEASE-READINESS.md)。

## 文件始终在本机

工作区预览不会移动原文件。「收录副本」会将内容复制到知识库，之后可以独立编辑和整理。正文与附件保留为文件，页面设置、文档标识和历史索引保存在知识库的 `.reader` 目录。

| 平台 | 默认知识库目录 |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`，未设置时使用 `~/.local/share/Reader/知识库` |

更新或卸载插件不会主动删除知识库。备份时请连同正文、附件和元数据一起保存，见 [数据与恢复](docs/DATA-AND-RECOVERY.md)。

Agent 访问需要另行授权。分享快照只包含主动选择发布的内容，原文后续修改不会自动更新到快照。临时外网分享依赖隧道服务、网络以及本机持续运行。

## 使用与帮助

- [使用指南](docs/USER-GUIDE.md)：从打开文档到整理、恢复和分享。
- [插件说明](plugins/reader-workspace/README.md)：安装、连接设置与 Agent 授权。
- [支持范围与已知问题](docs/RELEASE-READINESS.md)：平台、格式和分享限制。
- [版本变化](CHANGELOG.md)：每个版本带来的变化。
- [反馈问题](https://github.com/bigricedumpling/deepseek-reader/issues)：请附版本、系统和复现步骤，示例内容请先脱敏。

## 从源码开发

开发环境需要 Node.js 24 或更新版本。在仓库根目录执行：

```bash
npm ci
npm run dev
```

开发时可设置 `DOCS_ROOT` 指向独立数据目录。构建使用 `npm run build`；基础检查使用 `npm run check` 和 `npm run typecheck`。

项目使用 Vue 3、Vite、Milkdown、Node.js 和 SQLite。参与开发可阅读 [工程说明](docs/ENGINEERING.md) 与 [存储架构](docs/数据与扩展架构.md)；独立网站维护者可阅读 [服务器部署](docs/DEPLOYMENT.md)。

## 许可

[MIT License](LICENSE)。第三方字体与阅读组件遵循各自许可，见 [第三方资产](docs/THIRD-PARTY-ASSETS.md)。
