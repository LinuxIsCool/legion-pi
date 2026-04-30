/**
 * Legion factory tissue.
 *
 * Two tools backed by the (forthcoming) claude-factory MCP server:
 *
 *   factory_harvest()    pull candidate signals from inboxes / sources
 *   factory_status()     show pipeline state (harvested / validated / built)
 *
 * The claude-factory plugin does not yet ship an MCP server; default
 * command targets the conventional uv-project path. Override via env:
 *   LEGION_FACTORY_MCP_CMD     full command line (space-separated)
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { callMcpTool, extractMcpText, type McpCommand, resolveMcpCommand } from "./_mcp.js";

const PLUGIN_ROOT = join(
	homedir(),
	".claude/plugins/local/legion-plugins/plugins/claude-factory",
);

const DEFAULT_CMD: McpCommand = {
	cmd: "uv",
	args: ["run", "--project", PLUGIN_ROOT, "python", "-m", "claude_factory.mcp_server"],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_FACTORY_MCP_CMD", DEFAULT_CMD);
}

const harvestTool = defineTool({
	name: "factory_harvest",
	label: "Factory Harvest",
	description: "Run a harvest pass — pull candidate signals from configured sources.",
	parameters: Type.Object({
		source: Type.Optional(
			Type.String({ description: "Optional single-source filter (e.g. 'gmail', 'rss')" }),
		),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {};
		if (params.source !== undefined) args.source = params.source;
		const r = await callMcpTool(command(), "factory_harvest", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `factory_harvest error: ${r.error}` }],
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

const statusTool = defineTool({
	name: "factory_status",
	label: "Factory Status",
	description: "Show factory pipeline state — counts at each stage.",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const r = await callMcpTool(command(), "factory_status", {});
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `factory_status error: ${r.error}` }],
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

const factoryTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(harvestTool);
	pi.registerTool(statusTool);
};

export default factoryTissue;
