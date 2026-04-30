import { describe, expect, it, vi } from "vitest";
import koiTissue from "../../../extensions/legion/koi.js";

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

describe("koi tissue", () => {
	it("registers koi_recall, koi_store, and koi_namespaces", async () => {
		const api = fakeApi();
		await koiTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("koi_recall");
		expect(names).toContain("koi_store");
		expect(names).toContain("koi_namespaces");
	});

	it("subscribes to session_start for liveness probe", async () => {
		const api = fakeApi();
		await koiTissue(api as any);
		expect(api.on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("liveness probe notifies when KOI is unreachable", async () => {
		const api = fakeApi();
		const prev = process.env.KOI_BASE_URL;
		// Point at a port nothing is listening on so the fetch fails fast.
		process.env.KOI_BASE_URL = "http://127.0.0.1:1";
		try {
			await koiTissue(api as any);
			const handler = api._handlers.get("session_start");
			const ctx = { ui: { notify: vi.fn() }, cwd: process.cwd() };
			await handler?.({ type: "session_start", reason: "startup" }, ctx);
			const calls = ctx.ui.notify.mock.calls.map((c: any[]) => c[0]);
			expect(calls.some((m) => m.includes("offline"))).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.KOI_BASE_URL;
			else process.env.KOI_BASE_URL = prev;
		}
	});

	it("each tool exposes a typebox parameter schema", async () => {
		const api = fakeApi();
		await koiTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});
});
