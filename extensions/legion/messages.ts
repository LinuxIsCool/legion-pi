/**
 * Legion messages tissue.
 *
 * One read-only tool backed by the claude-messages MCP server (sometimes
 * called legion-messages in the runtime — the plugin name on disk is
 * claude-messages):
 *
 *   messages_search(query, platform?, since?, limit?)
 *
 * Override the spawn command via env:
 *   LEGION_MESSAGES_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-messages plugin's mcp.mjs build artefact.
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
			".claude/plugins/local/legion-plugins/plugins/claude-messages/server/build/mcp.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_MESSAGES_MCP_CMD", DEFAULT_CMD);
}

const searchTool = defineTool({
	name: "messages_search",
	label: "Messages Search",
	description:
		"Full-text search across the unified messaging archive (Telegram, Signal, Email, Slack, WhatsApp).",
	parameters: Type.Object({
		query: Type.String({ description: "Free-text search query" }),
		platform: Type.Optional(
			Type.String({
				description:
					"Optional platform filter (telegram | signal | email | slack | whatsapp)",
			}),
		),
		since: Type.Optional(
			Type.String({ description: "Optional ISO 8601 lower-bound timestamp" }),
		),
		limit: Type.Optional(Type.Number({ description: "Max results (default 20)" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { query: params.query };
		if (params.platform !== undefined) args.platform = params.platform;
		if (params.since !== undefined) args.since = params.since;
		if (params.limit !== undefined) args.limit = params.limit;
		const r = await callMcpTool(command(), "messages_search", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `messages_search error: ${r.error}` }],
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

const messagesTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(searchTool);
};

export default messagesTissue;
