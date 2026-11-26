# Typocket

[English](README.md)

Typocket 是本地 Markdown 编辑器。发行包包含浏览器界面、本地服务、文档读写所用的 MCP 工具和 `reader-workspace` Skill。

![DeepSeek Harness 中，左侧是印刷工作室的英文对话，右侧是 Typocket 打开的文档。](https://raw.githubusercontent.com/bigricedumpling/typocket/main/docs/images/readme-sidebar.webp)

## 在浏览器中打开

从 [GitHub 发布页](https://github.com/bigricedumpling/typocket/releases)下载并解压 `.tgz`，保留完整的 `package` 文件夹。安装 Node.js 24 或更高版本后，在这个文件夹的上一级目录运行以下命令。

```sh
node package/managed-server.js
```

保持服务运行，用浏览器打开终端显示的地址。如果 Agent 客户端的侧栏浏览器能访问本机服务，也可以直接在侧栏打开这个地址。

### 阅读文档

Markdown 在编辑器中打开。右上角的 **Aa** 用于调整字体、字号、行距和正文宽度，修改后立即生效。PDF 使用只读阅读器，可翻页和缩放。HTML（H5）文件在隔离的只读页面中预览。

## 在其他 Agent 中使用

启动 Typocket，在 Agent 的 MCP 设置中添加本机 **stdio** 服务。将示例中的脚本路径换成解压后 `scripts/reader.mjs` 的绝对路径。

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

让 Agent 列出 Typocket 的知识库，即可验证连接。通过文档工具保存的修改会出现在“Agent 改动”中，可在此对照前后两个版本。

- **WorkBuddy** 可以在“连接器 → 自定义连接器”中添加上述服务。[连接器说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- **Claude Code** 也可以用 `claude --plugin-dir "/absolute/path/to/package"` 开启会话，同时加载技能和 MCP 工具。
- **Codex CLI** 可以直接用上面的 stdio 配置。如果已经克隆本仓库，也可以依次运行 `codex plugin marketplace add "/absolute/path/to/typocket"` 和 `codex plugin add reader-workspace@typocket`，再新开会话。

### 内置 Skill 和文档工具

客户端连接 MCP 后会收到随包的 [reader-workspace Skill](skills/reader-workspace/SKILL.md)。文档工具会查找本机正在运行的 Typocket，用于搜索知识库、读取文档和保存修改。Skill 说明了如何定位选中的段落、保留图片引用，以及如何处理同时修改同一篇文档的情况。

支持单独导入 Skill 的客户端也可以加载这份文件。实际操作需要能调用文档工具或访问本地服务。有终端权限的 Agent 可以直接运行工具，例如用 `node "/absolute/path/to/package/scripts/reader.mjs" reader_libraries` 列出知识库。

远程 Agent 需要能连接到运行 Typocket 的机器。若要指定实例，在 MCP 服务的环境变量中设置 `READER_URL` 和对应的知识库根目录 `DOCS_ROOT`。若服务提示版本过旧，更新并重启该实例即可。

## 在 DSH 中安装

1. 在 [DSH 社区插件市场](https://awesome-dsh-plugin.com/?q=Typocket)搜索并安装 Typocket。若已下载 `.tgz`，也可以在 DSH NEXT 的“插件 → 添加插件”中选中安装包。
2. 在右侧栏选择“开始 → Typocket”。DSH 会启动本地服务，也可通过插件工具栏的浏览器按钮在独立窗口中打开编辑器。
3. 从 DSH 工作区打开 Markdown，可以预览正文、图片和相对链接。点“保存到知识库”即创建一份可编辑的副本。工作区原稿与知识库副本各自保存。

支持 Skill 的 DSH NEXT 会话可以直接调用文档工具，读写范围取决于会话权限。在工作区写入模式下，向工作区以外的知识库写入前，DSH 会请求授权。

DSH 可复用 `127.0.0.1:8090` 上已有的实例。服务停止后，插件会显示离线。使用远程实例时，在插件设置中填写其 HTTPS 地址。

## 本机数据

| 系统 | 默认知识库目录 |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`，未设置时使用 `~/.local/share/Reader/知识库` |

本地服务监听回环地址，并记住使用的端口。更新或卸载后，知识库保留在原目录。要沿用已有目录，在启动服务前设置 `DOCS_ROOT` 或 `DSH_READER_DATA_DIR`。两者同时设置时，优先使用 `DOCS_ROOT`。迁移文件前请先备份。

## 导出与分享

打印为 PDF 或导出独立 HTML 网页时会保留正文和图表。要生成临时只读链接，在“更多 → 通过 Agent 分享”中指定文档或知识库，将生成的提示词交给具备网页托管能力的 Agent。

安装包面向 macOS、Windows 和 Linux。macOS 上已验证 DSH NEXT 安装、双窗口编辑和冲突时另存副本。Windows 和 Linux 上的原生 DSH 安装与桌面交互还有待验证。[各平台支持情况](https://github.com/bigricedumpling/typocket/blob/main/docs/RELEASE-READINESS.md)

[MIT 许可](LICENSE)　[第三方资产](https://github.com/bigricedumpling/typocket/blob/main/docs/THIRD-PARTY-ASSETS.md)
