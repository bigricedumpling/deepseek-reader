# Reader Workspace

A local MCP stdio adapter and CLI for the Reader HTTP service. Requires Node.js 24 and a running Reader. No direct filesystem access is exposed to the agent.

In Reader, open the bottom-left workspace menu and Agent connection. Create a scoped credential, copy it once, and pass it using the host's environment configuration:

- `READER_URL`: Reader origin or deployed base URL, for example `http://127.0.0.1:8090`
- `READER_TOKEN`: scoped credential, never an administrator password

Start MCP with `node scripts/reader.mjs --stdio` from this package directory. `.mcp.json` declares this command for a compatible plugin host. Installing/enabling the package is a separate action; this repository does not automatically install it.

CLI usage: `node scripts/reader.mjs <tool-name> '<JSON arguments>'`. Use MCP tool discovery for the exact schemas. The package includes a Reader skill documenting safe read/edit workflows.

Updates require the revision returned by the last read. A 409 means re-read and merge; never retry by overwriting. Reuse requestId for retries of the same mutation. The credential cannot manage access settings or reach other libraries, and can be revoked in Reader.
