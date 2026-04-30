import { describe, expect, it, vi } from "vitest";
import promptsTissue from "../../../extensions/legion/prompts.js";

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

describe("prompts tissue", () => {
	it("registers prompts_get and prompts_search", async () => {
		const api = fakeApi();
		await promptsTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("prompts_get");
		expect(names).toContain("prompts_search");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await promptsTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_PROMPTS_MCP_CMD;
		process.env.LEGION_PROMPTS_MCP_CMD = "this-binary-does-not-exist-77c3a4e1";
		try {
			await promptsTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "prompts_search");
			const r = await tool.execute("ps1", { query: "anything" });
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_PROMPTS_MCP_CMD;
			else process.env.LEGION_PROMPTS_MCP_CMD = prev;
		}
	}, 10_000);
});
