import { describe, expect, it, vi } from "vitest";
import roadmapsTissue from "../../../extensions/legion/roadmaps.js";

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

describe("roadmaps tissue", () => {
	it("registers expectation_list and expectation_evaluate", async () => {
		const api = fakeApi();
		await roadmapsTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("expectation_list");
		expect(names).toContain("expectation_evaluate");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await roadmapsTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("expectation_evaluate schema requires id", async () => {
		const api = fakeApi();
		await roadmapsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "expectation_evaluate");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("id");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["id"]));
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_ROADMAPS_MCP_CMD;
		process.env.LEGION_ROADMAPS_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await roadmapsTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "expectation_list");
			const r = await tool.execute("c1", {});
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_ROADMAPS_MCP_CMD;
			else process.env.LEGION_ROADMAPS_MCP_CMD = prev;
		}
	}, 10_000);
});
