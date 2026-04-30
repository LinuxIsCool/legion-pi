/**
 * Legion prompts tissue.
 *
 * Two tools backed by the claude-prompts MCP server:
 *
 *   prompts_get(id)         fetch a single prompt card by id
 *   prompts_search(query)   FTS over the prompt-card library
 *
 * Override the spawn command via env:
 *   LEGION_PROMPTS_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-prompts plugin's mcp.mjs build artefact.
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
			".claude/plugins/local/legion-plugins/plugins/claude-prompts/server/build/mcp.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_PROMPTS_MCP_CMD", DEFAULT_CMD);
}

const getTool = defineTool({
	name: "prompts_get",
	label: "Prompts Get",
	description: "Fetch a single prompt card by id.",
	parameters: Type.Object({
		id: Type.String({ description: "Prompt card id" }),
	}),
	async execute(_id, params) {
		const r = await callMcpTool(command(), "prompts_get", { id: params.id });
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `prompts_get error: ${r.error}` }],
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

const searchTool = defineTool({
	name: "prompts_search",
	label: "Prompts Search",
	description: "Full-text search across the prompt-card library.",
	parameters: Type.Object({
		query: Type.String({ description: "Free-text search query" }),
		limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { query: params.query };
		if (params.limit !== undefined) args.limit = params.limit;
		const r = await callMcpTool(command(), "prompts_search", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `prompts_search error: ${r.error}` }],
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

const promptsTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(getTool);
	pi.registerTool(searchTool);
};

export default promptsTissue;
