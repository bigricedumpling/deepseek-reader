# Typocket

[简体中文](README.zh-CN.md)

Write in a local Markdown file and let your agent work on the same draft. In DeepSeek Harness you can keep the document open beside the conversation. You can also use the editor in a browser and connect an agent over MCP.

![An English print studio conversation beside its document in the Typocket sidebar in DeepSeek Harness.](https://raw.githubusercontent.com/bigricedumpling/typocket/main/docs/images/readme-sidebar.webp)

## Open Typocket in a browser

Download the `.tgz` file from [GitHub Releases](https://github.com/bigricedumpling/typocket/releases) and extract it. Keep the `package` folder together. From its parent directory, start Typocket with Node.js 24 or later.

```sh
node package/managed-server.js
```

Open the address printed in the terminal and leave the process running. If DSH has already started Typocket, its toolbar has a button to open the same editor in your browser.

## Connect an agent

With Typocket running, add a local **stdio** MCP server in your agent’s settings. Use `node` as the command. For the first argument, enter the full path to the script inside the extracted package. The second argument is `--stdio`.

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

Ask the agent to “list my Typocket libraries.” After it edits a document through Typocket, open **Agent changes** (Agent 改动) to compare the two versions.

- **WorkBuddy** lets you add this server under **Connectors → Custom connector**. [WorkBuddy guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- **Claude Code** can also load the skill and MCP tools together. Start a session with `claude --plugin-dir "/absolute/path/to/package"`.
- **Codex CLI** can use the stdio configuration above. If you have a checkout of this repository, another option is to run `codex plugin marketplace add "/absolute/path/to/typocket"`, then `codex plugin add reader-workspace@typocket`. Start a new session.

The MCP server finds Typocket on your machine and supplies the [library skill](skills/reader-workspace/SKILL.md). If you load the skill on its own, the agent also needs shell, tool, or local service access. A cloud agent needs a connection back to your machine. To choose a different running instance, set `READER_URL` and its matching library root, `DOCS_ROOT`, in the MCP server’s environment. If prompted to update, update and restart that instance.

## Install in DSH

1. Find Typocket in the [DSH community market](https://awesome-dsh-plugin.com/?q=Typocket). To install a downloaded `.tgz` in DSH NEXT, choose **Plugins → Add plugin** (插件 → 添加插件).
2. In the right sidebar, choose **Start → Typocket** (开始 → Typocket). DSH starts the local service.
3. Open a Markdown file from the DSH workspace to preview its text, images, and relative links. Choose **Save to library** (保存到知识库) to make an editable copy. The workspace original and the library copy are saved separately.

DSH NEXT sessions with skill support can use the document tools directly. The tools follow the session’s permissions. In workspace-write mode, DSH asks before writing to a library outside the workspace.

## Where your files live

| System | Default library directory |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`, or `~/.local/share/Reader/知识库` |

Your libraries stay on disk when you update or uninstall the plugin. To use an existing library root, set `DSH_READER_DATA_DIR` before starting DSH. Back up your files before moving them.

The local service listens on loopback and remembers its port. DSH can reuse an instance at `127.0.0.1:8090`. If that process stops, the plugin shows it as offline. For a remote instance, enter its HTTPS address in the plugin settings.

## Export and share

Print a PDF or export a self-contained HTML page to keep the document and its rendered diagrams together. For a temporary read-only link, choose **More → Share via agent** (更多 → 通过 Agent 分享), select a document or library, and give the prompt to an agent that can host it.

The package supports macOS, Windows, and Linux. We’ve tested installation in DSH NEXT, two-window editing, and saving a separate copy after a conflict on macOS. Native DSH installation and desktop interaction still need testing on Windows and Linux. [Platform details](https://github.com/bigricedumpling/typocket/blob/main/docs/RELEASE-READINESS.md)

[MIT license](LICENSE) · [Third-party assets](https://github.com/bigricedumpling/typocket/blob/main/docs/THIRD-PARTY-ASSETS.md)
