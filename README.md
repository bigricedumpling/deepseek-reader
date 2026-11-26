# Typocket

[简体中文](README.zh-CN.md)

Typocket is a local Markdown editor. You and your agent can work on the same file and see what changed. Open it in a browser, or keep the draft beside your conversation in DeepSeek Harness.

[Download](https://github.com/bigricedumpling/typocket/releases) | [Run it locally](#run-it-locally) | [Connect an agent](plugins/reader-workspace/README.md#connect-an-agent)

![A print studio conversation in DeepSeek Harness, with Typocket open in the right sidebar.](docs/images/readme-sidebar.webp)

## Reading and editing

Click a paragraph to start writing. Select a phrase to format it, add a link, or insert an inline equation. In a longer note, use the outline on the right to jump to a section. Open **Aa** to change the typeface, line spacing, or text width.

![A sentence selected in the proof notes, with the formatting toolbar above it and the document outline on the right.](docs/images/readme-editor.webp)

## Revising with an agent

Select a passage and choose **Copy for Agent**. The copied text includes the file path and, when available, the section heading. When your agent saves an edit through Typocket, open **Agent changes** to compare the old and new lines. Here the original instructions called for moving the blue plate. The revision keeps it fixed and moves the red plate two millimetres to the left.

![An edit to the press instructions. The red line shows the original wording and the green line shows the correction.](docs/images/readme-agent.webp)

## Keeping references open

Libraries and folders live in the sidebar. Tabs can hold notes from different libraries, so you can look up a paper stock or a typeface and come straight back to the proof. Give a library an icon you recognise at a glance. A note can have its own icon, which also appears on its tab.

![Six libraries with monochrome icons, a folder tree, and open tabs for the paper, type and proof notes.](docs/images/readme-navigation.webp)

<details>
<summary>View illustrations, Mermaid diagrams, libraries and covers</summary>

Place pictures between paragraphs. Use the image toolbar to enlarge a proof and inspect its registration marks.

![A two-colour print proof alongside the individual ink separations, embedded in the page.](docs/images/readme-reading.webp)

Mermaid diagrams and mind maps render in the text. Choose **View source** to edit one with the preview open. You can also typeset equations in LaTeX. PDF and HTML exports keep the rendered diagrams and equations.

![Mermaid source above its live print-check flowchart in the dark editor.](docs/images/readme-diagram.webp)

The library overview shows a page from each collection. For a document cover, use a picture of your own or pick a looping ink drawing from the gallery.

![Ink, type, paper and proof pages visible inside four library folders.](docs/images/readme-library.webp)

![A proof book with a printing press icon, blue proof marks and the cover gallery open.](docs/images/readme-cover.webp)

</details>

## Export and share

Choose **Markdown and attachments** to send someone an editable ZIP with the images included. For a read-only link, choose **Share via agent**. Give the prompt to an agent that can host a snapshot of the selected document or library.

## Run it locally

Download the `.tgz` from [Releases](https://github.com/bigricedumpling/typocket/releases) and extract it. With Node.js 24 or later, run this from the directory containing the extracted `package` folder. Open the local address printed in the terminal.

```sh
node package/managed-server.js
```

- **Connect an agent.** Use a client that supports local stdio MCP. The setup guide includes a sample configuration and steps for WorkBuddy, Claude Code and Codex. [Agent setup](plugins/reader-workspace/README.md#connect-an-agent)
- **Install in DeepSeek Harness.** Search for Typocket in the community market. After installation, open it from **Start** in the right sidebar. [DSH community market](https://awesome-dsh-plugin.com/?q=Typocket)
- **Run from source.** From the repository, run `npm ci` and then `npm run dev`. [Development guide (中文)](docs/ENGINEERING.md)

*The screenshots show Preview 9 with sample notes and a sample conversation. The editor currently uses Chinese. Its controls were translated for these images.*

[Changelog (中文)](CHANGELOG.md) | [Backup and recovery (中文)](docs/DATA-AND-RECOVERY.md) | [Platform support (中文)](docs/RELEASE-READINESS.md) | [MIT license](LICENSE) | [Third-party credits](docs/THIRD-PARTY-ASSETS.md)
