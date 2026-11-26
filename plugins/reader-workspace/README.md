# Typocket

[简体中文](README.zh-CN.md)

Typocket is a local Markdown editor. The release includes the browser interface, a local service, MCP tools for working with documents, and the `reader-workspace` Skill.

![An English print studio conversation beside its document in the Typocket sidebar in DeepSeek Harness.](https://raw.githubusercontent.com/bigricedumpling/typocket/main/docs/images/readme-sidebar.webp)

## Open Typocket in a browser

Download the `.tgz` file from [GitHub Releases](https://github.com/bigricedumpling/typocket/releases) and extract it. Keep the `package` folder together. From its parent directory, start Typocket with Node.js 24 or later.

```sh
node package/managed-server.js
```

Keep the process running and open the address printed in the terminal. An agent application with a browser sidebar can open the same address if its browser has access to the local service.

### Reading documents

Markdown opens in the editor. Use **Aa** in the upper right to adjust the font, text size, line spacing or text width. Changes appear on the open page. PDF references open in a read-only viewer with page navigation and zoom. HTML (H5) files open in a sandboxed, read-only preview.

## Connect an agent

Start Typocket, then add a local **stdio** server in the agent’s MCP settings. Replace the script path in this example with its absolute path on your machine.

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

Ask the agent to list your Typocket libraries to verify the connection. Edits saved through the document tools appear under **Agent changes** (Agent 改动), with the original and revised text.

- **WorkBuddy** lets you add this server under **Connectors → Custom connector**. [WorkBuddy guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- **Claude Code** can also load the skill and MCP tools together. Start a session with `claude --plugin-dir "/absolute/path/to/package"`.
- **Codex CLI** can use the stdio configuration above. If you have a checkout of this repository, another option is to run `codex plugin marketplace add "/absolute/path/to/typocket"`, then `codex plugin add reader-workspace@typocket`. Start a new session.

### Bundled Skill and document tools

The MCP server supplies the [reader-workspace Skill](skills/reader-workspace/SKILL.md) when the client connects. Its tools locate the local service to search libraries, read documents and save revisions. The Skill describes how to locate a selected passage, preserve attachments, and handle edits made by another writer.

Clients that load Skills separately can import the same file. Running its operations requires access to the document tools or the local service. Agents with shell access can invoke a tool directly, for example `node "/absolute/path/to/package/scripts/reader.mjs" reader_libraries`.

A remote agent needs a connection to the machine running Typocket. To select a particular instance, set `READER_URL` and the matching library root, `DOCS_ROOT`, in the MCP server’s environment. If the service requests an update, update and restart that instance.

## Install in DSH

1. Find Typocket in the [DSH community market](https://awesome-dsh-plugin.com/?q=Typocket). To install a downloaded `.tgz` in DSH NEXT, choose **Plugins → Add plugin** (插件 → 添加插件).
2. In the right sidebar, choose **Start → Typocket** (开始 → Typocket). DSH starts the local service. The plugin toolbar also opens the same editor in a separate browser window.
3. Open a Markdown file from the DSH workspace to preview its text, images, and relative links. Choose **Save to library** (保存到知识库) to make an editable copy. The workspace original and the library copy are saved separately.

DSH NEXT sessions with Skill support can use the document tools directly. The tools follow the session’s permissions. In workspace-write mode, DSH asks before writing to a library outside the workspace.

DSH can reuse an instance at `127.0.0.1:8090`. If that process stops, the plugin reports it as offline. For a remote instance, enter its HTTPS address in the plugin settings.

## Where your files live

| System | Default library directory |
| --- | --- |
| macOS | `~/Library/Application Support/Reader/知识库` |
| Windows | `%APPDATA%\Reader\知识库` |
| Linux | `$XDG_DATA_HOME/Reader/知识库`, or `~/.local/share/Reader/知识库` |

The local service listens on loopback and remembers its port. Libraries stay on disk after an update or uninstall. To use an existing library root, set `DOCS_ROOT` or `DSH_READER_DATA_DIR` before starting the service. If both are set, `DOCS_ROOT` takes precedence. Back up your files before moving them.

## Export and share

Print a PDF or export a self-contained HTML page to keep the document and its rendered diagrams together. For a temporary read-only link, choose **More → Share via agent** (更多 → 通过 Agent 分享), select a document or library, and give the prompt to an agent that can host it.

The package supports macOS, Windows, and Linux. We’ve tested installation in DSH NEXT, two-window editing, and saving a separate copy after a conflict on macOS. Native DSH installation and desktop interaction still need testing on Windows and Linux. [Platform details](https://github.com/bigricedumpling/typocket/blob/main/docs/RELEASE-READINESS.md)

[MIT license](LICENSE) | [Third-party assets](https://github.com/bigricedumpling/typocket/blob/main/docs/THIRD-PARTY-ASSETS.md)
