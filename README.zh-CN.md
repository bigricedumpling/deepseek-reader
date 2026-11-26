# Typocket

[English](README.md)

Typocket 是一个可以和 Agent 共用的本地 Markdown 编辑器。你在浏览器里读写笔记，Agent 也能打开同一篇文档。它改完后，你可以逐行核对改动。

[下载 Typocket](https://github.com/bigricedumpling/typocket/releases) · [在本机运行](#在本机运行) · [接入 Agent](plugins/reader-workspace/README.zh-CN.md)

![在 Typocket 中打开的印刷笔记。正文里是钴蓝与朱红的套印样张，旁边是两张单色分版。](docs/images/readme-reading.webp)

## 把一段话交给 Agent

选中正文，点「复制给 Agent」，就能把原文连同文档位置和小节一起发给它。通过 Typocket 工具接入的 Agent 可以找到这篇笔记，读到最新内容，再把修改写回来。

图里是一份印刷操作记录。蓝版已经对准，Agent 把「移动蓝版」改成了「固定蓝版，向左移动红版」，还在正式开印前加了一次打样。打开「Agent 改动」就能对照这两处原话，点「打开文档」继续写。

![在 Agent 改动中对照印刷笔记的两处修改，分别涉及移动哪块色版，以及何时再次打样。](docs/images/readme-agent.webp)

## 在正文里改图

文档中的 Mermaid 代码块会直接显示为图表。点「查看源码」，可以对着预览修改流程分支。保存下来的 Markdown 仍保留 Mermaid 源码。LaTeX 公式也可以在正文中编辑。导出 PDF 或独立 HTML 时，排好的图表和公式会一起带上。

![深色编辑器中，上方是 Mermaid 源码，下方是实时流程图，标出可以开印和需要调整色版的两种情况。](docs/images/readme-diagram.webp)

## 找回正在写的那一篇

可以给每个项目建一个知识库，用文件夹整理笔记和参考资料。知识库总览会展示各库的内页预览。不同知识库的文档可以并排开在标签栏里，查完资料就能回到刚才写的位置。忘了文件名，也可以凭记得的一句话跨库搜正文。

![四个印刷知识库各有自己的图标，卡片露出油墨、字样、纸张和校样的内页。](docs/images/readme-library.webp)

## 给常用的文档做个记号

知识库和文档可以各自选图标。文档打开后，图标也会出现在标签栏里。图中的校样本用了小印刷机图标，封面是一幅循环播放的蓝墨校对线稿。打开图库就能换一张，也可以上传自己的图片。

![校样本的印刷机图标和蓝墨线稿封面，右侧展开的图库里有六个可选封面。](docs/images/readme-cover.webp)

## 把文档交给别人

Markdown、图片、PDF 和 HTML 资料都保存在本机。需要让别人接着改时，选「Markdown 和附件」即可把正文和配图打成 ZIP。只想给对方一个阅读链接，可以选「通过 Agent 分享」，把提示词发给能够托管网页的 Agent，由它为选中的文档或知识库生成只读链接。

## 在本机运行

从[发布页](https://github.com/bigricedumpling/typocket/releases)下载并解压 `.tgz`。准备好 Node.js 24 或更高版本，在解压出来的 `package` 文件夹所在目录执行以下命令，再用浏览器打开终端显示的本机地址。

```sh
node package/managed-server.js
```

**接入 Agent。** 支持本机 stdio MCP 的客户端都可以连接。命令填 `node`，两个参数依次为 `package/scripts/reader.mjs` 的绝对路径和 `--stdio`。说明里提供了可复制的配置，以及 WorkBuddy、Claude Code 和 Codex 的接法。[Agent 接入说明](plugins/reader-workspace/README.zh-CN.md)

**在 DeepSeek Harness 中使用。** 从 DSH 插件市场安装后，通过侧栏打开 Typocket。插件会自动启动本机服务，DSH 工作区里的 Markdown 可以直接预览，也可以保存到知识库。[DSH 插件市场](https://awesome-dsh-plugin.com/?q=Typocket)

**从源码运行。** 使用 Node.js 24 或更高版本，在仓库目录依次执行 `npm ci` 和 `npm run dev`。[工程说明](docs/ENGINEERING.md)

*配图拍摄自 Preview 9，使用英文示例文档。截图中的界面标签已译为英文，当前应用界面为中文。*

[使用指南](docs/USER-GUIDE.md) · [版本变化](CHANGELOG.md) · [备份与恢复](docs/DATA-AND-RECOVERY.md) · [平台支持](docs/RELEASE-READINESS.md) · [MIT 许可](LICENSE) · [第三方资产](docs/THIRD-PARTY-ASSETS.md)
