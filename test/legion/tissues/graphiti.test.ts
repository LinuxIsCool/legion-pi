import { describe, expect, it, vi } from "vitest";
import graphitiTissue from "../../../extensions/legion/graphiti.js";

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

describe("graphiti tissue", () => {
	it("registers graphiti_recall", async () => {
		const api = fakeApi();
		await graphitiTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("graphiti_recall");
	});

	it("subscribes to session_start for liveness probe", async () => {
		const api = fakeApi();
		await graphitiTissue(api as any);
		expect(api.on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await graphitiTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("reports a clear failure when the docker binary is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_GRAPHITI_DOCKER_BIN;
		process.env.LEGION_GRAPHITI_DOCKER_BIN = "this-binary-does-not-exist-1c4a8f99";
		try {
			await graphitiTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "graphiti_recall");
			expect(tool).toBeDefined();
			const result = await tool.execute("test-call", { query: "anything" });
			expect(result.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
			expect(result.details.ok).toBe(false);
		} finally {
			if (prev === undefined) delete process.env.LEGION_GRAPHITI_DOCKER_BIN;
			else process.env.LEGION_GRAPHITI_DOCKER_BIN = prev;
		}
	}, 10_000);

	it("liveness probe notifies when FalkorDB is unreachable", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_GRAPHITI_DOCKER_BIN;
		process.env.LEGION_GRAPHITI_DOCKER_BIN = "this-binary-does-not-exist-1c4a8f99";
		try {
			await graphitiTissue(api as any);
			const handler = api._handlers.get("session_start");
			const ctx = { ui: { notify: vi.fn() }, cwd: process.cwd() };
			await handler?.({ type: "session_start", reason: "startup" }, ctx);
			const calls = ctx.ui.notify.mock.calls.map((c: any[]) => c[0]);
			expect(calls.some((m) => m.includes("offline"))).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.LEGION_GRAPHITI_DOCKER_BIN;
			else process.env.LEGION_GRAPHITI_DOCKER_BIN = prev;
		}
	}, 10_000);

	it("accepts an optional point_in_time parameter", async () => {
		const api = fakeApi();
		await graphitiTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "graphiti_recall");
		expect(tool).toBeDefined();
		// Schema should have a point_in_time property (optional). Typebox renders
		// optional fields outside the `required` array.
		const schema = tool.parameters as any;
		expect(schema.properties).toBeDefined();
		expect(Object.keys(schema.properties)).toContain("point_in_time");
	});
});
