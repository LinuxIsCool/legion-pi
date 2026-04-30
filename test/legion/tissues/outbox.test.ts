import { describe, expect, it, vi } from "vitest";
import outboxTissue from "../../../extensions/legion/outbox.js";

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

describe("outbox tissue", () => {
	it("registers outbox_draft_create and outbox_draft_list", async () => {
		const api = fakeApi();
		await outboxTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("outbox_draft_create");
		expect(names).toContain("outbox_draft_list");
	});

	it("does NOT register a send tool — drafts only", async () => {
		const api = fakeApi();
		await outboxTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).not.toContain("outbox_draft_send");
		expect(names).not.toContain("outbox_draft_approve");
		expect(names).not.toContain("outbox_send");
	});

	it("outbox_draft_create schema requires recipient + channel + body", async () => {
		const api = fakeApi();
		await outboxTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "outbox_draft_create");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("recipient");
		expect(Object.keys(schema.properties)).toContain("channel");
		expect(Object.keys(schema.properties)).toContain("body");
		expect(schema.required ?? []).toEqual(
			expect.arrayContaining(["recipient", "channel", "body"]),
		);
	});

	it("reports a clear failure when the MCP server command is bogus", async () => {
		const api = fakeApi();
		const prev = process.env.LEGION_OUTBOX_MCP_CMD;
		process.env.LEGION_OUTBOX_MCP_CMD = "this-binary-does-not-exist-3edb1ab2";
		try {
			await outboxTissue(api as any);
			const tool = api._registered.find((t: any) => t.name === "outbox_draft_list");
			const r = await tool.execute("c1", {});
			expect(r.details.ok).toBe(false);
			expect(r.content[0].text.toLowerCase()).toMatch(/error|failed|spawn|enoent/);
		} finally {
			if (prev === undefined) delete process.env.LEGION_OUTBOX_MCP_CMD;
			else process.env.LEGION_OUTBOX_MCP_CMD = prev;
		}
	}, 10_000);
});
