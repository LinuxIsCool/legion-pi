import { describe, expect, it, vi } from "vitest";
import recordingsTissue from "../../../extensions/legion/recordings.js";

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

describe("recordings tissue", () => {
	it("registers recordings_search and recordings_get", async () => {
		const api = fakeApi();
		await recordingsTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("recordings_search");
		expect(names).toContain("recordings_get");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await recordingsTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_RECORDINGS_MCP_CMD;
		process.env.LEGION_RECORDINGS_MCP_CMD = "this-binary-does-not-exist-c8d29ef1";
		try {
			await recordingsTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "recordings_search");
			const r = await tool.execute("rs1", { query: "anything" });
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_RECORDINGS_MCP_CMD;
			else process.env.LEGION_RECORDINGS_MCP_CMD = prev;
		}
	}, 10_000);
});
