# Typocket

[English](README.md)

用浏览器打开本机的 Markdown 草稿，自己接着写，也可以交给 Agent 修改，再逐段核对它改了什么。发行包里有编辑器、本地服务和 Agent 读写知识库的工具。

![在 Typocket 中查看双色套印校样和笔记](https://raw.githubusercontent.com/bigricedumpling/typocket/main/docs/images/readme-reading.webp)

## 在浏览器中打开

从 [GitHub 发布页](https://github.com/bigricedumpling/typocket/releases)下载名称以 `dsh-reader-workspace-` 开头的 `.tgz` 安装包，解压并保留完整的 `package` 目录。安装 Node.js 24 或更新版本，用以下命令启动本机服务。

```sh
node "/插件绝对路径/managed-server.js"
```

在浏览器打开终端显示的本机地址，使用期间保持进程运行。若已在 DSH 中启动 Typocket，直接点顶栏的外部打开按钮即可。

## 在其他 Agent 中使用

先启动 Typocket，再在 Agent 的 MCP 设置中添加一个 **stdio** 服务器。命令填 `node`，两个参数依次填插件目录中 `scripts/reader.mjs` 的绝对路径和 `--stdio`。支持 JSON 的宿主可以使用以下配置，替换示例中的路径。

```json
{
  "mcpServers": {
    "typocket": {
      "command": "node",
      "args": ["/插件绝对路径/scripts/reader.mjs", "--stdio"]
    }
  }
}
```

连接后，告诉 Agent「列出我在 Typocket 中的知识库」。Agent 用这些工具保存的修改可在「Agent 改动」里对照前后两版。

- **WorkBuddy**　打开「连接器 → 自定义连接器」，添加上面的 MCP 服务。[WorkBuddy 连接器说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- **Claude Code**　用 `claude --plugin-dir "/插件绝对路径"` 启动本地会话，从同一目录加载技能和 MCP 工具。
- **Codex CLI**　已有 Typocket 源码仓库时，运行 `codex plugin marketplace add "/Typocket仓库绝对路径"`，再运行 `codex plugin add reader-workspace@typocket`，然后新开会话。只有解压后的发行包时，用上面的 stdio 配置即可。

桥接脚本会查找本机 Typocket，并在连接时将[知识库使用技能](skills/reader-workspace/SKILL.md)交给客户端。只导入技能的宿主还需要能运行工具、命令行或访问本机服务。云端 Agent 需要宿主提供到本机的连接。要指定另一个本机实例，可在 MCP 服务器的环境变量中设置 `READER_URL`，并用 `DOCS_ROOT` 指定对应的知识库根目录。如果服务提示版本过旧，请更新并重启该实例。

## 在 DSH 中安装

1. 在 [DSH 社区插件市场](https://awesome-dsh-plugin.com/?q=Typocket)搜索 Typocket 并安装。手动安装时，在 DSH NEXT 的「插件 → 添加插件」中选择下载的 `.tgz`。
2. 从右侧栏的「开始 → Typocket」进入。启用插件时 DSH 会自动启动随包服务。
3. 在 DSH 文件区打开 Markdown，可以只读预览正文、相对链接和图片。点「保存到知识库」后即可编辑副本，工作区原稿与知识库副本各自保存。

在支持技能的 DSH NEXT 会话中，Agent 可以直接使用随包工具。本机读写沿用会话权限。默认的工作区写入模式下，如果知识库在工作区以外，DSH 会询问是否允许本次写入。

## 本机数据

| 系统 | 默认知识库目录 |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`，未设置时使用 `~/.local/share/Reader/知识库` |

知识库存放在插件目录之外，更新和卸载后仍保留在原处。本机服务监听回环地址，重启后沿用原先的端口。DSH 可以接入已有的 `127.0.0.1:8090` 实例，原服务停止时会提示离线。要沿用已有数据目录，可在启动 DSH 前设置 `DSH_READER_DATA_DIR`。需要迁移目录时请先备份。插件详情中也可手动指定另一台 Typocket 的 HTTPS 地址。

## 导出与分享

打印成 PDF 或导出独立网页，都可以保留此刻的正文与 Mermaid 图表。要分享一篇文档或整套知识库，可选「更多 → 通过 Agent 分享」，把提示词交给有临时托管能力的 Agent，让它制作只读快照并返回网址。

插件面向 macOS、Windows 和 Linux。macOS 已验证 DSH NEXT 安装、双窗口编辑以及冲突时另存副本。Windows 与 Linux 的原生 DSH 安装和桌面交互仍待验收。[各平台支持情况](https://github.com/bigricedumpling/typocket/blob/main/docs/RELEASE-READINESS.md)

[MIT 许可](LICENSE) · [第三方资产](https://github.com/bigricedumpling/typocket/blob/main/docs/THIRD-PARTY-ASSETS.md)
