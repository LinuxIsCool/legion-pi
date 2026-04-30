/**
 * Legion schedule tissue.
 *
 * Three tools backed by the claude-schedule MCP server (bun-driven):
 *
 *   schedule_summary()                  high-level view of today + week
 *   block_create(title, start, end, ...)  create a schedule block
 *   free_slots(min_minutes)             find open windows of >= N minutes
 *
 * Override the spawn command via env:
 *   LEGION_SCHEDULE_MCP_CMD     full command line (space-separated)
 *
 * Default: bun run $CLAUDE_PLUGIN_ROOT/src/mcp/server.ts in the
 * claude-schedule plugin tree.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { callMcpTool, extractMcpText, type McpCommand, resolveMcpCommand } from "./_mcp.js";

const DEFAULT_CMD: McpCommand = {
	cmd: "bun",
	args: [
		"run",
		join(
			homedir(),
			".claude/plugins/local/legion-plugins/plugins/claude-schedule/src/mcp/server.ts",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_SCHEDULE_MCP_CMD", DEFAULT_CMD);
}

const summaryTool = defineTool({
	name: "schedule_summary",
	label: "Schedule Summary",
	description: "Show high-level summary of the current schedule (today + this week).",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const r = await callMcpTool(command(), "schedule_summary", {});
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `schedule_summary error: ${r.error}` }],
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

const blockCreateTool = defineTool({
	name: "block_create",
	label: "Schedule Block Create",
	description: "Create a new schedule block.",
	parameters: Type.Object({
		title: Type.String({ description: "Block title" }),
		start: Type.String({ description: "ISO 8601 start timestamp" }),
		end: Type.String({ description: "ISO 8601 end timestamp" }),
		description: Type.Optional(Type.String({ description: "Optional block description" })),
		tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tags" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {
			title: params.title,
			start: params.start,
			end: params.end,
		};
		if (params.description !== undefined) args.description = params.description;
		if (params.tags !== undefined) args.tags = params.tags;
		const r = await callMcpTool(command(), "block_create", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `block_create error: ${r.error}` }],
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

const freeSlotsTool = defineTool({
	name: "free_slots",
	label: "Schedule Free Slots",
	description: "Find free time slots of at least N minutes within the active schedule window.",
	parameters: Type.Object({
		min_minutes: Type.Number({ description: "Minimum slot duration in minutes" }),
		date_range: Type.Optional(
			Type.String({ description: "Optional date range, e.g. 'today' or 'this-week'" }),
		),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { min_minutes: params.min_minutes };
		if (params.date_range !== undefined) args.date_range = params.date_range;
		const r = await callMcpTool(command(), "free_slots", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `free_slots error: ${r.error}` }],
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

const scheduleTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(summaryTool);
	pi.registerTool(blockCreateTool);
	pi.registerTool(freeSlotsTool);
};

export default scheduleTissue;
