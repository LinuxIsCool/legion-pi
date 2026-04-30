/**
 * Legion transcripts tissue.
 *
 * One read-only tool backed by the claude-transcripts MCP server:
 *
 *   transcripts_search(query, speaker?, limit?)   FTS over transcripts DB
 *
 * Override the spawn command via env:
 *   LEGION_TRANSCRIPTS_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-transcripts plugin's mcp.mjs build artefact.
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
			".claude/plugins/local/legion-plugins/plugins/claude-transcripts/server/build/mcp.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_TRANSCRIPTS_MCP_CMD", DEFAULT_CMD);
}

const searchTool = defineTool({
	name: "transcripts_search",
	label: "Transcripts Search",
	description: "Full-text search across transcripts, optionally filtered by speaker.",
	parameters: Type.Object({
		query: Type.String({ description: "Free-text search query" }),
		speaker: Type.Optional(
			Type.String({ description: "Optional speaker filter (slug or display name)" }),
		),
		limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { query: params.query };
		if (params.speaker !== undefined) args.speaker = params.speaker;
		if (params.limit !== undefined) args.limit = params.limit;
		const r = await callMcpTool(command(), "transcripts_search", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `transcripts_search error: ${r.error}` }],
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

const transcriptsTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(searchTool);
};

export default transcriptsTissue;
