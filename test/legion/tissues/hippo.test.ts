import { describe, expect, it, vi } from "vitest";
import hippoTissue from "../../../extensions/legion/hippo.js";

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

describe("hippo tissue", () => {
	it("registers hippo_recall and hippo_index", async () => {
		const api = fakeApi();
		await hippoTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("hippo_recall");
		expect(names).toContain("hippo_index");
	});

	it("subscribes to session_start for liveness probe", async () => {
		const api = fakeApi();
		await hippoTissue(api as any);
		expect(api.on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await hippoTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("reports a clear failure when the docker binary is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_HIPPO_DOCKER_BIN;
		process.env.LEGION_HIPPO_DOCKER_BIN = "this-binary-does-not-exist-78f2c3a1";
		try {
			await hippoTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "hippo_recall");
			expect(tool).toBeDefined();
			const result = await tool.execute("test-call", { query: "anything" });
			expect(result.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
			expect(result.details.ok).toBe(false);
		} finally {
			if (prev === undefined) delete process.env.LEGION_HIPPO_DOCKER_BIN;
			else process.env.LEGION_HIPPO_DOCKER_BIN = prev;
		}
	}, 10_000);

	it("liveness probe notifies when FalkorDB is unreachable", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_HIPPO_DOCKER_BIN;
		process.env.LEGION_HIPPO_DOCKER_BIN = "this-binary-does-not-exist-78f2c3a1";
		try {
			await hippoTissue(api as any);
			const handler = api._handlers.get("session_start");
			const ctx = { ui: { notify: vi.fn() }, cwd: process.cwd() };
			await handler?.({ type: "session_start", reason: "startup" }, ctx);
			const calls = ctx.ui.notify.mock.calls.map((c: any[]) => c[0]);
			expect(calls.some((m) => m.includes("offline"))).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.LEGION_HIPPO_DOCKER_BIN;
			else process.env.LEGION_HIPPO_DOCKER_BIN = prev;
		}
	}, 10_000);
});
