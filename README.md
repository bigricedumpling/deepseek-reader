<h1 align="center">Typocket</h1>

<p align="center">一款可以和 Agent 共用的本地 Markdown 编辑器。<br>在 DSH 里读工作区的文档，接着写，把值得留下的资料收进自己的知识库。</p>

<p align="center"><a href="https://awesome-dsh-plugin.com/?q=Typocket"><b>从 DSH 市场安装</b></a>　 <a href="https://github.com/bigricedumpling/deepseek-reader/releases">下载安装包</a>　 <a href="docs/USER-GUIDE.md">使用指南</a></p>

![Typocket 正文阅读界面。英文声学笔记 Chladni plates 中，三幅原创数值插图呈现不同振动模式的节线。](docs/images/readme-reading.webp)

<sub>截图采用英文示例资料，界面标签作了对应翻译。</sub>

## 从 Agent 的草稿接着写

在 DSH 的文件区打开一篇 Markdown，就能看见排好版的正文、图片、表格和公式。想留下它时，点「保存到知识库」。工作区原稿留在原处，你可以放心整理自己的副本。

编辑时可以直接修改公式，或输入 `/` 插入内容。写到一半切去另一篇查资料，切回来仍能继续撤销刚才的输入。需要交付时，可以打印成 PDF，导出含图片的独立网页，或把 Markdown 和附件一起打成 ZIP，留给对方继续编辑。

## 记得一句话，也能找回一篇文档

![Typocket 知识库总览。英文示例资料按研究主题收纳，每个文件夹都能预览里面的一页。](docs/images/readme-library.webp)

用知识库区分研究、项目和个人笔记，再用文件夹整理。标签可以跨库打开。只记得原文的一句话时，打开侧栏搜索，选择「跨库正文」，点结果即可回到那段话。Markdown 的章节链接和 PDF 的页码链接也能直接定位。

## 和 Agent 改同一篇文章

![Typocket 的 Agent 改动记录，展示 Listening notes 中一条观察在修改前后的措辞。](docs/images/readme-agent.webp)

选中一段，点「复制给 Agent」，把选段、小节和出处一起粘贴到会话里。在知识库里，即使文章改过名，Agent 也可以通过文档标识找到原文。使用 Typocket 工具写回的修改会出现在「Agent 改动」里，方便逐段核对。遇到你们同时修改的段落，可以保留草稿再处理。

DSH 可直接使用随包工具。支持本机 stdio MCP 的其他 Agent 也能连接同一份资料。具体接法见[插件说明](plugins/reader-workspace/README.md#在其他-agent-中使用)。

## 安装与文件

在 [DSH 社区插件市场](https://awesome-dsh-plugin.com/?q=Typocket)安装后，从 DSH 右侧栏的「开始 → Typocket」打开。安装包自带本机服务。手动安装时，从 [GitHub Releases](https://github.com/bigricedumpling/deepseek-reader/releases) 下载 `.tgz`，在 DSH NEXT 的「插件 → 添加插件」中选中它。

正文以普通 Markdown 文件保存，PDF 和 HTML 也能在同一处预览。更新或卸载插件会保留知识库。备份时请同时保留正文、附件和元数据。[数据目录与备份恢复](docs/DATA-AND-RECOVERY.md) · [各平台支持情况](docs/RELEASE-READINESS.md) · [版本变化](CHANGELOG.md)

## 从源码运行

需要 Node.js 24 或更新版本。

```bash
npm ci
npm run dev
```

开发时可设置 `DOCS_ROOT` 指向独立的测试目录。`npm run build` 构建应用，`npm run release:plugin` 生成可安装的插件包。[工程说明](docs/ENGINEERING.md) · [报告问题](https://github.com/bigricedumpling/deepseek-reader/issues)

项目代码采用 [MIT 许可](LICENSE)。字体、图标与阅读组件的许可见[第三方资产](docs/THIRD-PARTY-ASSETS.md)。
