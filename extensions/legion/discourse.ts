/**
 * Legion discourse tissue.
 *
 * Two tools backed by the claude-discourse MCP server (uv-driven Python):
 *
 *   discourse_search(query)                          full-text search
 *   discourse_topic_create(title, body, category, tags?)
 *
 * Override the spawn command via env:
 *   LEGION_DISCOURSE_MCP_CMD     full command line (space-separated)
 *
 * Default: uv run scripts/mcp_server.py inside the claude-discourse plugin.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { callMcpTool, extractMcpText, type McpCommand, resolveMcpCommand } from "./_mcp.js";

const PLUGIN_ROOT = join(
	homedir(),
	".claude/plugins/local/legion-plugins/plugins/claude-discourse",
);

const DEFAULT_CMD: McpCommand = {
	cmd: "uv",
	args: ["run", "--project", PLUGIN_ROOT, "python", join(PLUGIN_ROOT, "scripts/mcp_server.py")],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_DISCOURSE_MCP_CMD", DEFAULT_CMD);
}

const searchTool = defineTool({
	name: "discourse_search",
	label: "Discourse Search",
	description: "Search Legion Forum posts by query.",
	parameters: Type.Object({
		query: Type.String({ description: "Free-text search query" }),
		limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { query: params.query };
		if (params.limit !== undefined) args.limit = params.limit;
		const r = await callMcpTool(command(), "discourse_search", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `discourse_search error: ${r.error}` }],
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

const topicCreateTool = defineTool({
	name: "discourse_topic_create",
	label: "Discourse Topic Create",
	description: "Create a new Legion Forum topic.",
	parameters: Type.Object({
		title: Type.String({ description: "Topic title" }),
		body: Type.String({ description: "Topic body (markdown)" }),
		category: Type.String({ description: "Category slug or id" }),
		tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tags" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {
			title: params.title,
			body: params.body,
			category: params.category,
		};
		if (params.tags !== undefined) args.tags = params.tags;
		const r = await callMcpTool(command(), "discourse_topic_create", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `discourse_topic_create error: ${r.error}` }],
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

const discourseTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(searchTool);
	pi.registerTool(topicCreateTool);
};

export default discourseTissue;
