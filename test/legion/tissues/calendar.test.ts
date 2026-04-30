import { describe, expect, it, vi } from "vitest";
import calendarTissue from "../../../extensions/legion/calendar.js";

function fakeApi() {
	const registered: any[] = [];
	const handlers = new Map<string, (event: any, ctx: any) => any>();
	return {
		registerTool: vi.fn((tool: any) => {
			registered.push(tool);
		}),
		on: vi.fn((event: string, handler: any) => {
			handlers.set(event, handler);
		}),
		ui: { notify: vi.fn() },
		_registered: registered,
		_handlers: handlers,
	};
}

describe("calendar tissue", () => {
	it("registers calendar_events and event_create", async () => {
		const api = fakeApi();
		await calendarTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("calendar_events");
		expect(names).toContain("event_create");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await calendarTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("calendar_events schema accepts a date_range", async () => {
		const api = fakeApi();
		await calendarTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "calendar_events");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("date_range");
	});

	it("event_create schema requires title, start, end", async () => {
		const api = fakeApi();
		await calendarTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "event_create");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("title");
		expect(Object.keys(schema.properties)).toContain("start");
		expect(Object.keys(schema.properties)).toContain("end");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["title", "start", "end"]));
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_CALENDAR_MCP_CMD;
		process.env.LEGION_CALENDAR_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await calendarTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "calendar_events");
			const r = await tool.execute("c1", {});
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_CALENDAR_MCP_CMD;
			else process.env.LEGION_CALENDAR_MCP_CMD = prev;
		}
	}, 10_000);
});
