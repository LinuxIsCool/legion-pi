import { describe, expect, it, vi } from "vitest";
import matrixTissue from "../../../extensions/legion/matrix.js";

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

describe("matrix tissue", () => {
	it("registers agent_list and agent_send", async () => {
		const api = fakeApi();
		await matrixTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("agent_list");
		expect(names).toContain("agent_send");
	});

	it("agent_send schema requires to + body and accepts optional confirm", async () => {
		const api = fakeApi();
		await matrixTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "agent_send");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("to");
		expect(Object.keys(schema.properties)).toContain("body");
		expect(Object.keys(schema.properties)).toContain("confirm");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["to", "body"]));
	});

	it("agent_send rejects ring 2+ peer without confirm=true", async () => {
		const api = fakeApi();
		await matrixTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "agent_send");
		const r = await tool.execute("s1", { to: "darren@dobby", body: "hello" });
		expect(r.details.ok).toBe(false);
		expect(r.content[0].text.toLowerCase()).toMatch(/confirm|ring/);
	});

	it("agent_send rejects ring 2+ peer with confirm=false", async () => {
		const api = fakeApi();
		await matrixTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "agent_send");
		const r = await tool.execute("s2", {
			to: "darren@dobby",
			body: "hello",
			confirm: false,
		});
		expect(r.details.ok).toBe(false);
		expect(r.content[0].text.toLowerCase()).toMatch(/confirm|ring/);
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_MATRIX_MCP_CMD;
		process.env.LEGION_MATRIX_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await matrixTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "agent_list");
			const r = await tool.execute("a1", {});
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_MATRIX_MCP_CMD;
			else process.env.LEGION_MATRIX_MCP_CMD = prev;
		}
	}, 10_000);
});
