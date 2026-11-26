# Typocket

[English](README.md)

你和 Agent 可以编辑同一份本地 Markdown。在 DeepSeek Harness 里，把文档放在对话旁边，就能边聊边看改了什么。也可以在浏览器里打开编辑器，通过 MCP 接入常用的 Agent。

![DeepSeek Harness 中，左侧是印刷工作室的英文对话，右侧是 Typocket 打开的文档。](https://raw.githubusercontent.com/bigricedumpling/typocket/main/docs/images/readme-sidebar.webp)

## 在浏览器中打开

从 [GitHub 发布页](https://github.com/bigricedumpling/typocket/releases)下载并解压 `.tgz`，保留完整的 `package` 文件夹。安装 Node.js 24 或更高版本后，在这个文件夹的上一级目录运行以下命令。

```sh
node package/managed-server.js
```

用浏览器打开终端显示的地址。使用期间保持服务运行。如果 DSH 已经启动了 Typocket，点工具栏上的浏览器按钮即可打开同一实例。

## 在其他 Agent 中使用

启动 Typocket，在 Agent 的 MCP 设置里添加本机 **stdio** 服务。命令填 `node`，第一个参数填解压目录里 `scripts/reader.mjs` 的绝对路径，第二个参数填 `--stdio`。

```json
{
  "mcpServers": {
    "typocket": {
      "command": "node",
      "args": ["/absolute/path/to/package/scripts/reader.mjs", "--stdio"]
    }
  }
}
```

接好后，试着问一句“我在 Typocket 里有哪些知识库？”它通过 Typocket 修改文档后，打开“Agent 改动”即可对照修改前后的内容。

- **WorkBuddy** 可以在“连接器 → 自定义连接器”中添加上述服务。[连接器说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- **Claude Code** 也可以用 `claude --plugin-dir "/absolute/path/to/package"` 开启会话，同时加载技能和 MCP 工具。
- **Codex CLI** 可以直接用上面的 stdio 配置。如果已经克隆本仓库，也可以依次运行 `codex plugin marketplace add "/absolute/path/to/typocket"` 和 `codex plugin add reader-workspace@typocket`，再新开会话。

MCP 服务会找到本机的 Typocket，并把[知识库使用技能](skills/reader-workspace/SKILL.md)交给 Agent。单独导入技能时，Agent 还需要能运行命令、调用文档工具或访问本地服务。云端 Agent 需要宿主提供到本机的连接。若要连接另一个运行中的实例，在 MCP 服务的环境变量中设置 `READER_URL` 和对应的知识库根目录 `DOCS_ROOT`。遇到版本过旧的提示，更新并重启该实例即可。

## 在 DSH 中安装

1. 在 [DSH 社区插件市场](https://awesome-dsh-plugin.com/?q=Typocket)搜索并安装 Typocket。若已下载 `.tgz`，也可以在 DSH NEXT 的“插件 → 添加插件”中选中安装包。
2. 在右侧栏选择“开始 → Typocket”。DSH 会启动本地服务。
3. 从 DSH 工作区打开 Markdown，可以预览正文、图片和相对链接。点“保存到知识库”即创建一份可编辑的副本。工作区原稿与知识库副本各自保存。

支持技能的 DSH NEXT 会话可以直接调用文档工具，读写范围取决于会话权限。在工作区写入模式下，向工作区以外的知识库写入前，DSH 会请求授权。

## 本机数据

| 系统 | 默认知识库目录 |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`，未设置时使用 `~/.local/share/Reader/知识库` |

更新或卸载插件，知识库都会保留在原处。要沿用已有目录，在启动 DSH 前设置 `DSH_READER_DATA_DIR`。迁移文件前请先备份。

本地服务监听回环地址，并记住使用的端口。DSH 可以接入已运行的 `127.0.0.1:8090` 实例，该服务停止后，插件会提示离线。使用远程实例时，在插件设置中填写其 HTTPS 地址即可。

## 导出与分享

打印为 PDF 或导出独立 HTML 网页，正文与排好的图表都会保留。想发一个临时只读链接，可以选“更多 → 通过 Agent 分享”，指定文档或知识库，把提示词发给能托管网页的 Agent。

安装包面向 macOS、Windows 和 Linux。macOS 上已验证 DSH NEXT 安装、双窗口编辑和冲突时另存副本。Windows 和 Linux 上的原生 DSH 安装与桌面交互还有待验证。[各平台支持情况](https://github.com/bigricedumpling/typocket/blob/main/docs/RELEASE-READINESS.md)

[MIT 许可](LICENSE)　[第三方资产](https://github.com/bigricedumpling/typocket/blob/main/docs/THIRD-PARTY-ASSETS.md)
