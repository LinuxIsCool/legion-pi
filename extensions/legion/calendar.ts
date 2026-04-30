/**
 * Legion calendar tissue.
 *
 * Two tools backed by the claude-calendar MCP server (bun-driven):
 *
 *   calendar_events(date_range?)                  list events in window
 *   event_create(title, start, end, ...)          create a calendar event
 *
 * Override the spawn command via env:
 *   LEGION_CALENDAR_MCP_CMD     full command line (space-separated)
 *
 * Default: bun run $CLAUDE_PLUGIN_ROOT/src/mcp/server.ts in the
 * claude-calendar plugin tree.
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
			".claude/plugins/local/legion-plugins/plugins/claude-calendar/src/mcp/server.ts",
		),
	],
};

function command(): McpCommand {
	return resolveMcpCommand("LEGION_CALENDAR_MCP_CMD", DEFAULT_CMD);
}

const eventsTool = defineTool({
	name: "calendar_events",
	label: "Calendar Events",
	description: "List calendar events, optionally restricted to a date range.",
	parameters: Type.Object({
		date_range: Type.Optional(
			Type.String({
				description:
					"Optional date range, e.g. '2026-04-30..2026-05-31' or 'today' or 'this-week'",
			}),
		),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {};
		if (params.date_range !== undefined) args.date_range = params.date_range;
		const r = await callMcpTool(command(), "event_list", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `calendar_events error: ${r.error}` }],
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

const createTool = defineTool({
	name: "event_create",
	label: "Calendar Event Create",
	description: "Create a calendar event.",
	parameters: Type.Object({
		title: Type.String({ description: "Event title" }),
		start: Type.String({ description: "ISO 8601 start timestamp" }),
		end: Type.String({ description: "ISO 8601 end timestamp" }),
		description: Type.Optional(Type.String({ description: "Optional event description" })),
		location: Type.Optional(Type.String({ description: "Optional location" })),
		tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tags" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = {
			title: params.title,
			start: params.start,
			end: params.end,
		};
		if (params.description !== undefined) args.description = params.description;
		if (params.location !== undefined) args.location = params.location;
		if (params.tags !== undefined) args.tags = params.tags;
		const r = await callMcpTool(command(), "event_create", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `event_create error: ${r.error}` }],
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

const calendarTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(eventsTool);
	pi.registerTool(createTool);
};

export default calendarTissue;
