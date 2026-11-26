# Typocket

[简体中文](README.zh-CN.md)

Typocket lets you and your agent work on the same local Markdown files. Open a draft in your browser, edit a paragraph, or check exactly what the agent changed. The release package includes the editor, its local service, and the tools an agent uses to reach your library.

![A two-color registration study open in Typocket](https://raw.githubusercontent.com/bigricedumpling/typocket/main/docs/images/readme-reading.webp)

## Open Typocket in a browser

Download the `dsh-reader-workspace-*.tgz` asset from [GitHub Releases](https://github.com/bigricedumpling/typocket/releases). Extract it and keep the resulting `package` directory together. Start the local service with Node.js 24 or later.

```sh
node "/absolute/path/to/package/managed-server.js"
```

Open the local address printed in the terminal. Leave the process running while you work. If DSH already has Typocket running, use the browser button in its toolbar to open that instance.

## Connect an agent

With Typocket running, add a **stdio** MCP server to your agent's settings. Use `node` as the command, followed by the absolute path to `scripts/reader.mjs` inside the plugin and the argument `--stdio`. For clients that accept JSON, replace the example path below.

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

Ask your agent to “list my Typocket libraries” to check the connection. When it saves a change through Typocket, you can review the before and after in **Agent changes** (Agent 改动).

- **WorkBuddy** — Open **Connectors → Custom connector** and add the MCP server above. [WorkBuddy connector guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- **Claude Code** — Start a local session with `claude --plugin-dir "/absolute/path/to/package"` to load the bundled skill and MCP tools.
- **Codex CLI** — With a local checkout of the Typocket repository, run `codex plugin marketplace add "/absolute/path/to/typocket"`, then `codex plugin add reader-workspace@typocket`. Start a new session. With the extracted release alone, use the stdio setup above.

The bridge discovers the local service and sends the [library skill](skills/reader-workspace/SKILL.md) to the client on connection. A host that loads skills on their own also needs a way to run the tools or reach the local service. Cloud agents need a host-provided connection to your machine. To select another running local instance, set `READER_URL` and its matching `DOCS_ROOT` in the MCP server's environment. If the service asks for an update, update and restart that instance.

## Install in DSH

1. Search for Typocket in the [DSH community market](https://awesome-dsh-plugin.com/?q=Typocket), or choose **Plugins → Add plugin** (插件 → 添加插件) in DSH NEXT and select the downloaded `.tgz`.
2. Open **Start → Typocket** (开始 → Typocket) in the right sidebar. DSH starts the bundled service for you.
3. Open a Markdown file in the DSH workspace to preview it with its relative links and images. Choose **Save to library** (保存到知识库) to edit a separate copy. The original and the saved copy can then be edited independently.

DSH NEXT sessions with skill support can use the bundled document tools directly. The local connection uses the session’s read-only and workspace permissions. In workspace-write mode, DSH asks before writing to a library outside the workspace.

## Where your files live

| System | Default library directory |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`, or `~/.local/share/Reader/知识库` |

Libraries live outside the plugin directory and survive updates and removal. The service listens on the loopback interface and remembers its port. DSH can reuse an existing Typocket at `127.0.0.1:8090` and will report it offline if that service stops. To keep using an existing data directory, set `DSH_READER_DATA_DIR` before starting DSH. Back up your library before moving it. The plugin details also accept an HTTPS address for a manually configured remote instance.

## Export and share

Print to PDF or export a self-contained HTML file to keep the current version of your document, including Mermaid diagrams. To share a read-only snapshot of a document or library, choose **More → Share via agent** (更多 → 通过 Agent 分享). Give the resulting prompt to an agent that can host it and return a temporary link.

The package targets macOS, Windows and Linux. Native DSH NEXT installation and two-window editing have been tested on macOS, including saving a separate copy after a conflict. Native DSH installation and desktop interaction on Windows and Linux still need testing. [Platform details](https://github.com/bigricedumpling/typocket/blob/main/docs/RELEASE-READINESS.md)

[MIT license](LICENSE) · [Third-party assets](https://github.com/bigricedumpling/typocket/blob/main/docs/THIRD-PARTY-ASSETS.md)
