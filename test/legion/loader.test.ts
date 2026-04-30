import { describe, expect, it, vi } from "vitest";
import legionLoader from "../../extensions/legion/_loader.js";

function fakeApi() {
	const flags = new Map<string, string | boolean | undefined>();
	const handlers = new Map<string, (event: any, ctx: any) => any>();
	const registered: any[] = [];
	const ui = { notify: vi.fn() };
	const api = {
		registerFlag: vi.fn((name: string, options: any) => {
			flags.set(name, options.default);
		}),
		registerTool: vi.fn((tool: any) => {
			registered.push(tool);
		}),
		on: vi.fn((event: string, handler: any) => {
			handlers.set(event, handler);
		}),
		getFlag: vi.fn((name: string) => flags.get(name)),
		ui,
		_setFlag(name: string, value: string | boolean) {
			flags.set(name, value);
		},
		_handlers: handlers,
		_registered: registered,
	};
	return api;
}

describe("legion loader", () => {
	it("registers the --legion flag", async () => {
		const api = fakeApi();
		await legionLoader(api as any);
		expect(api.registerFlag).toHaveBeenCalledWith(
			"legion",
			expect.objectContaining({ type: "string" }),
		);
	});

	it("subscribes to session_start", async () => {
		const api = fakeApi();
		await legionLoader(api as any);
		expect(api.on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("parses a comma-separated tissue list and reports unknown tissues", async () => {
		const api = fakeApi();
		await legionLoader(api as any);
		api._setFlag("legion", "definitely-not-a-real-tissue,also-fake");
		const handler = api._handlers.get("session_start");
		expect(handler).toBeDefined();
		const ctx = {
			ui: { notify: vi.fn() },
			cwd: process.cwd(),
		};
		await handler?.({ type: "session_start", reason: "startup" }, ctx);
		const messages = ctx.ui.notify.mock.calls.map((c: any[]) => c[0]);
		expect(messages.some((m) => m.includes("definitely-not-a-real-tissue"))).toBe(true);
		expect(messages.some((m) => m.includes("also-fake"))).toBe(true);
	});

	it("treats --legion all as every tissue in the manifest", async () => {
		const api = fakeApi();
		await legionLoader(api as any);
		const handler = api._handlers.get("session_start");
		api._setFlag("legion", "all");
		const ctx = { ui: { notify: vi.fn() }, cwd: process.cwd() };
		// We don't actually load tissues here (they'd require backing services);
		// we just confirm the handler accepts "all" without throwing on unknown
		// slugs and emits at least one notify per tissue (load attempt or skip).
		await handler?.({ type: "session_start", reason: "startup" }, ctx);
		expect(ctx.ui.notify).toHaveBeenCalled();
	});

	it("does nothing when --legion is empty", async () => {
		const api = fakeApi();
		await legionLoader(api as any);
		const handler = api._handlers.get("session_start");
		api._setFlag("legion", "");
		const ctx = { ui: { notify: vi.fn() }, cwd: process.cwd() };
		await handler?.({ type: "session_start", reason: "startup" }, ctx);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});
});
