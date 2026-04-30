import { describe, expect, it, vi } from "vitest";
import scheduleTissue from "../../../extensions/legion/schedule.js";

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

describe("schedule tissue", () => {
	it("registers schedule_summary, block_create, free_slots", async () => {
		const api = fakeApi();
		await scheduleTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("schedule_summary");
		expect(names).toContain("block_create");
		expect(names).toContain("free_slots");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await scheduleTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("free_slots schema requires min_minutes", async () => {
		const api = fakeApi();
		await scheduleTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "free_slots");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("min_minutes");
	});

	it("block_create schema requires title, start, end", async () => {
		const api = fakeApi();
		await scheduleTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "block_create");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("title");
		expect(Object.keys(schema.properties)).toContain("start");
		expect(Object.keys(schema.properties)).toContain("end");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["title", "start", "end"]));
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_SCHEDULE_MCP_CMD;
		process.env.LEGION_SCHEDULE_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await scheduleTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "schedule_summary");
			const r = await tool.execute("c1", {});
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_SCHEDULE_MCP_CMD;
			else process.env.LEGION_SCHEDULE_MCP_CMD = prev;
		}
	}, 10_000);
});
