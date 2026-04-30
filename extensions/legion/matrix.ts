/**
 * Legion matrix tissue.
 *
 * Two tools backed by the claude-matrix MCP server:
 *
 *   agent_list()                       list known peers
 *   agent_send(to, body, confirm?)     send a message to a peer
 *
 * Safety contract: agent_send to any peer that is NOT a ring-1 local agent
 * (i.e. not on this host) requires `confirm: true`. By default, sending to
 * a ring 2+ peer is rejected with an explanation. Local pid@hostname agents
 * on this host pass through unconfirmed.
 *
 * Override the spawn command via env:
 *   LEGION_MATRIX_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-matrix plugin's index.mjs build artefact.
 */
import { hostname } from "node:os";
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
			".claude/plugins/local/legion-plugins/plugins/claude-matrix/server/build/index.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_MATRIX_MCP_CMD", DEFAULT_CMD);
}

/**
 * A peer is "ring 1" (local) iff its agent_id ends with `@<this-hostname>`.
 * Anything else (a different hostname, or a non-pid id like "darren@dobby")
 * is ring 2+ and requires explicit confirm to send to.
 */
function isLocalPeer(to: string): boolean {
	const host = hostname();
	return to.endsWith(`@${host}`);
}

const listTool = defineTool({
	name: "agent_list",
	label: "Matrix Agent List",
	description: "List Claude Code agents known to the matrix.",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const r = await callMcpTool(command(), "list_agents", {});
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `agent_list error: ${r.error}` }],
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

const sendTool = defineTool({
	name: "agent_send",
	label: "Matrix Agent Send",
	description:
		"Send a message to another agent. Ring 2+ peers (off-host) require confirm=true.",
	parameters: Type.Object({
		to: Type.String({ description: "Recipient agent id (e.g. 'pid-12345@hostname')" }),
		body: Type.String({ description: "Message body" }),
		confirm: Type.Optional(
			Type.Boolean({
				description: "Required (true) for ring 2+ peers. Default false.",
			}),
		),
	}),
	async execute(_id, params) {
		const local = isLocalPeer(params.to);
		const confirmed = params.confirm === true;
		if (!local && !confirmed) {
			const msg = `agent_send refused: '${params.to}' is a ring 2+ peer; pass confirm=true to send.`;
			return {
				content: [{ type: "text", text: msg }],
				details: { ok: false, error: msg, ring: 2, confirmed: false },
			};
		}
		const r = await callMcpTool(command(), "send_message", {
			to: params.to,
			message: params.body,
		});
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `agent_send error: ${r.error}` }],
				details: { ok: false, error: r.error },
			};
		}
		const text = extractMcpText(r.result) || "(empty result)";
		return {
			content: [{ type: "text", text }],
			details: { ok: true, raw: r.result, ring: local ? 1 : 2, confirmed },
		};
	},
});

const matrixTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(listTool);
	pi.registerTool(sendTool);
};

export default matrixTissue;
