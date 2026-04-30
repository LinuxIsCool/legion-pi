/**
 * Legion dock tissue.
 *
 * Two tools backed by the (forthcoming) claude-dock MCP server:
 *
 *   dock_list()             list installed dock skills
 *   dock_install(repo)      clone a GitHub repo and convert to a Claude skill
 *
 * As of this writing, the claude-dock plugin does not yet ship an MCP
 * server — the default command points at the conventional path (Python uv
 * project) and will surface a spawn error if invoked. Override via env:
 *   LEGION_DOCK_MCP_CMD     full command line (space-separated)
 *
 * Once the plugin grows an MCP server the default below works without code
 * changes; agents that need dock today can set the env var to wrap a CLI
 * (e.g. a small JSON-RPC shim around `claude-dock install`).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { callMcpTool, extractMcpText, type McpCommand, resolveMcpCommand } from "./_mcp.js";

const PLUGIN_ROOT = join(
	homedir(),
	".claude/plugins/local/legion-plugins/plugins/claude-dock",
);

const DEFAULT_CMD: McpCommand = {
	cmd: "uv",
	args: ["run", "--project", PLUGIN_ROOT, "python", "-m", "claude_dock.mcp_server"],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_DOCK_MCP_CMD", DEFAULT_CMD);
}

const listTool = defineTool({
	name: "dock_list",
	label: "Dock List",
	description: "List installed dock skills (cloned-repo skills).",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const r = await callMcpTool(command(), "dock_list", {});
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `dock_list error: ${r.error}` }],
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

const installTool = defineTool({
	name: "dock_install",
	label: "Dock Install",
	description: "Clone a GitHub repo and install it as a Claude Code skill.",
	parameters: Type.Object({
		repo: Type.String({
			description: "GitHub repo (e.g. 'owner/repo' or full URL)",
		}),
		ref: Type.Optional(Type.String({ description: "Optional branch or tag" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { repo: params.repo };
		if (params.ref !== undefined) args.ref = params.ref;
		const r = await callMcpTool(command(), "dock_install", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `dock_install error: ${r.error}` }],
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

const dockTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(listTool);
	pi.registerTool(installTool);
};

export default dockTissue;
