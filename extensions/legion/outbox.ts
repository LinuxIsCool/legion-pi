/**
 * Legion outbox tissue.
 *
 * Drafts-only surface over the claude-outbox MCP server. We deliberately do
 * NOT expose `outbox_draft_send` or `outbox_draft_approve` — those are
 * Shawn's call, not the agent's. An agent can DRAFT a message and LIST its
 * own drafts; sending requires human review through the existing CLI/UI
 * outside this runtime.
 *
 *   outbox_draft_create(recipient, channel, body, ...)
 *   outbox_draft_list()
 *
 * Override the spawn command via env:
 *   LEGION_OUTBOX_MCP_CMD     full command line (space-separated)
 *
 * Default: claude-outbox plugin's index.mjs build artefact.
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
			".claude/plugins/local/legion-plugins/plugins/claude-outbox/server/build/index.mjs",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_OUTBOX_MCP_CMD", DEFAULT_CMD);
}

const draftCreateTool = defineTool({
	name: "outbox_draft_create",
	label: "Outbox Draft Create",
	description:
		"Create an outbound message DRAFT. The draft is NOT sent — Shawn approves and sends manually.",
	parameters: Type.Object({
		recipient: Type.String({ description: "Recipient identifier (e.g. 'shawn', 'darren')" }),
		channel: Type.String({ description: "Channel slug (e.g. 'claude.md-proposal', 'matrix')" }),
		body: Type.String({ description: "Draft body" }),
		subject: Type.Optional(Type.String({ description: "Optional subject line" })),
		tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tags" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {
			recipient: params.recipient,
			channel: params.channel,
			body: params.body,
		};
		if (params.subject !== undefined) args.subject = params.subject;
		if (params.tags !== undefined) args.tags = params.tags;
		const r = await callMcpTool(command(), "outbox_draft_create", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `outbox_draft_create error: ${r.error}` }],
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

const draftListTool = defineTool({
	name: "outbox_draft_list",
	label: "Outbox Draft List",
	description: "List pending outbound drafts awaiting Shawn's approval.",
	parameters: Type.Object({
		recipient: Type.Optional(Type.String({ description: "Optional recipient filter" })),
		channel: Type.Optional(Type.String({ description: "Optional channel filter" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {};
		if (params.recipient !== undefined) args.recipient = params.recipient;
		if (params.channel !== undefined) args.channel = params.channel;
		const r = await callMcpTool(command(), "outbox_draft_list", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `outbox_draft_list error: ${r.error}` }],
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

const outboxTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(draftCreateTool);
	pi.registerTool(draftListTool);
};

export default outboxTissue;
