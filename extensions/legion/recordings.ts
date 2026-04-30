/**
 * Legion recordings tissue.
 *
 * Two read-only tools backed by the claude-recordings MCP server
 * (`node $CLAUDE_PLUGIN_ROOT/server/build/mcp.mjs`):
 *
 *   recordings_search(query, limit?)   FTS over the recordings DB
 *   recordings_get(id)                 fetch a single recording row
 *
 * Override the spawn command via env:
 *   LEGION_RECORDINGS_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-recordings plugin's mcp.mjs build artefact.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { callMcpTool, extractMcpText, type McpCommand, resolveMcpCommand } from "./_mcp.js";

const DEFAULT_CMD: McpCommand = {
	cmd: "node",
	args: [
		join(
			homedir(),
			".claude/plugins/local/legion-plugins/plugins/claude-recordings/server/build/mcp.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_RECORDINGS_MCP_CMD", DEFAULT_CMD);
}

const searchTool = defineTool({
	name: "recordings_search",
	label: "Recordings Search",
	description: "Full-text search across recording transcripts and metadata.",
	parameters: Type.Object({
		query: Type.String({ description: "Free-text search query" }),
		limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { query: params.query };
		if (params.limit !== undefined) args.limit = params.limit;
		const r = await callMcpTool(command(), "recordings_search", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `recordings_search error: ${r.error}` }],
				details: { ok: false, error: r.error },
			};
		}
		const text = extractMcpText(r.result) || "(empty result)";
		return {
			content: [{ type: "text", text }],
			details: { ok: true, raw: r.result },
		};
	},
});

const getTool = defineTool({
	name: "recordings_get",
	label: "Recordings Get",
	description: "Fetch a single recording's metadata and transcript by id.",
	parameters: Type.Object({
		id: Type.String({ description: "Recording id (UUID or numeric)" }),
	}),
	async execute(_id, params) {
		const r = await callMcpTool(command(), "recordings_get", { id: params.id });
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `recordings_get error: ${r.error}` }],
				details: { ok: false, error: r.error },
			};
		}
		const text = extractMcpText(r.result) || "(empty result)";
		return {
			content: [{ type: "text", text }],
			details: { ok: true, raw: r.result },
		};
	},
});

const recordingsTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(searchTool);
	pi.registerTool(getTool);
};

export default recordingsTissue;
