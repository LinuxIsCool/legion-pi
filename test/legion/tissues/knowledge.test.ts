import { describe, expect, it, vi } from "vitest";
import knowledgeTissue from "../../../extensions/legion/knowledge.js";

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

describe("knowledge tissue", () => {
	it("registers knowledge_recall and knowledge_store", async () => {
		const api = fakeApi();
		await knowledgeTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("knowledge_recall");
		expect(names).toContain("knowledge_store");
	});

	it("registers knowledge_health", async () => {
		const api = fakeApi();
		await knowledgeTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("knowledge_health");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await knowledgeTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_KNOWLEDGE_MCP_CMD;
		process.env.LEGION_KNOWLEDGE_MCP_CMD = "this-binary-does-not-exist-3a92573f";
		try {
			await knowledgeTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "knowledge_recall");
			expect(tool).toBeDefined();
			const result = await tool.execute("test-call", { query: "anything" });
			expect(result.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
			expect(result.details.ok).toBe(false);
		} finally {
			if (prev === undefined) delete process.env.LEGION_KNOWLEDGE_MCP_CMD;
			else process.env.LEGION_KNOWLEDGE_MCP_CMD = prev;
		}
	}, 10_000);
});
