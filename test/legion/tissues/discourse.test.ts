import { describe, expect, it, vi } from "vitest";
import discourseTissue from "../../../extensions/legion/discourse.js";

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

describe("discourse tissue", () => {
	it("registers discourse_search and discourse_topic_create", async () => {
		const api = fakeApi();
		await discourseTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("discourse_search");
		expect(names).toContain("discourse_topic_create");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await discourseTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("discourse_search schema requires query", async () => {
		const api = fakeApi();
		await discourseTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "discourse_search");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("query");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["query"]));
	});

	it("discourse_topic_create schema requires title, body, category", async () => {
		const api = fakeApi();
		await discourseTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "discourse_topic_create");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("title");
		expect(Object.keys(schema.properties)).toContain("body");
		expect(Object.keys(schema.properties)).toContain("category");
		expect(schema.required ?? []).toEqual(
			expect.arrayContaining(["title", "body", "category"]),
		);
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_DISCOURSE_MCP_CMD;
		process.env.LEGION_DISCOURSE_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await discourseTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "discourse_search");
			const r = await tool.execute("c1", { query: "anything" });
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_DISCOURSE_MCP_CMD;
			else process.env.LEGION_DISCOURSE_MCP_CMD = prev;
		}
	}, 10_000);
});
