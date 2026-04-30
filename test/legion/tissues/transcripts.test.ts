import { describe, expect, it, vi } from "vitest";
import transcriptsTissue from "../../../extensions/legion/transcripts.js";

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

describe("transcripts tissue", () => {
	it("registers transcripts_search", async () => {
		const api = fakeApi();
		await transcriptsTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("transcripts_search");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await transcriptsTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("transcripts_search schema includes optional speaker filter", async () => {
		const api = fakeApi();
		await transcriptsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "transcripts_search");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("query");
		expect(Object.keys(schema.properties)).toContain("speaker");
		expect(Object.keys(schema.properties)).toContain("limit");
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_TRANSCRIPTS_MCP_CMD;
		process.env.LEGION_TRANSCRIPTS_MCP_CMD = "this-binary-does-not-exist-2f9a45c1";
		try {
			await transcriptsTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "transcripts_search");
			const r = await tool.execute("ts1", { query: "anything" });
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_TRANSCRIPTS_MCP_CMD;
			else process.env.LEGION_TRANSCRIPTS_MCP_CMD = prev;
		}
	}, 10_000);
});
