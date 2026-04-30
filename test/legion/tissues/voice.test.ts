import { describe, expect, it, vi } from "vitest";
import voiceTissue from "../../../extensions/legion/voice.js";

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

describe("voice tissue", () => {
	it("registers voice_speak", async () => {
		const api = fakeApi();
		await voiceTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("voice_speak");
	});

	it("each tool exposes a typebox parameter schema and an execute fn", async () => {
		const api = fakeApi();
		await voiceTissue(api as any);
		for (const tool of api._registered) {
			expect(tool.parameters).toBeDefined();
			expect(typeof tool.execute).toBe("function");
		}
	});

	it("voice_speak schema includes text and persona", async () => {
		const api = fakeApi();
		await voiceTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "voice_speak");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("text");
		expect(Object.keys(schema.properties)).toContain("persona");
	});

	it("voice_speak reports a clear failure when the daemon is unreachable", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_VOICE_URL;
		// Point at a port nothing is listening on so the fetch fails fast.
		process.env.LEGION_VOICE_URL = "http://127.0.0.1:1/speak";
		try {
			await voiceTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "voice_speak");
			const r = await tool.execute("v1", { text: "hello", persona: "matt" });
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|refused|fetch/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_VOICE_URL;
			else process.env.LEGION_VOICE_URL = prev;
		}
	}, 10_000);

	it("subscribes to session_start for liveness probe", async () => {
		const api = fakeApi();
		await voiceTissue(api as any);
		expect(api.on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});

	it("liveness probe notifies when daemon is unreachable", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_VOICE_URL;
		process.env.LEGION_VOICE_URL = "http://127.0.0.1:1/speak";
		try {
			await voiceTissue(api as any);
			const handler = api._handlers.get("session_start");
			const ctx = { ui: { notify: vi.fn() }, cwd: process.cwd() };
			await handler?.({ type: "session_start", reason: "startup" }, ctx);
			const calls = ctx.ui.notify.mock.calls.map((c: any[]) => c[0]);
			expect(calls.some((m) => m.includes("offline"))).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.LEGION_VOICE_URL;
			else process.env.LEGION_VOICE_URL = prev;
		}
	}, 10_000);
});
