/**
 * Legion roadmaps tissue.
 *
 * Two tools backed by the claude-roadmaps MCP server (Node-built):
 *
 *   expectation_list()             list all roadmap expectations
 *   expectation_evaluate(id)       run an evaluation pass on one expectation
 *
 * Override the spawn command via env:
 *   LEGION_ROADMAPS_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-roadmaps plugin's mcp.mjs build artefact.
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
			".claude/plugins/local/legion-plugins/plugins/claude-roadmaps/server/build/mcp.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_ROADMAPS_MCP_CMD", DEFAULT_CMD);
}

const listTool = defineTool({
	name: "expectation_list",
	label: "Roadmap Expectation List",
	description: "List active roadmap expectations.",
	parameters: Type.Object({
		status: Type.Optional(
			Type.String({ description: "Optional status filter (e.g. 'active', 'resolved')" }),
		),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {};
		if (params.status !== undefined) args.status = params.status;
		const r = await callMcpTool(command(), "expectation_list", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `expectation_list error: ${r.error}` }],
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

const evaluateTool = defineTool({
	name: "expectation_evaluate",
	label: "Roadmap Expectation Evaluate",
	description: "Evaluate a single roadmap expectation against current state.",
	parameters: Type.Object({
		id: Type.String({ description: "Expectation id" }),
	}),
	async execute(_id, params) {
		const r = await callMcpTool(command(), "expectation_evaluate", { id: params.id });
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `expectation_evaluate error: ${r.error}` }],
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

const roadmapsTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(listTool);
	pi.registerTool(evaluateTool);
};

export default roadmapsTissue;
