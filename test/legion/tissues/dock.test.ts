import { describe, expect, it, vi } from "vitest";
import dockTissue from "../../../extensions/legion/dock.js";

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

describe("dock tissue", () => {
	it("registers dock_list and dock_install", async () => {
		const api = fakeApi();
		await dockTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("dock_list");
		expect(names).toContain("dock_install");
	});

	it("dock_install schema requires repo", async () => {
		const api = fakeApi();
		await dockTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "dock_install");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("repo");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["repo"]));
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_DOCK_MCP_CMD;
		process.env.LEGION_DOCK_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await dockTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "dock_list");
			const r = await tool.execute("c1", {});
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_DOCK_MCP_CMD;
			else process.env.LEGION_DOCK_MCP_CMD = prev;
		}
	}, 10_000);
});
