import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import scratchpadTissue from "../../../extensions/legion/scratchpad.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "legion-scratchpad-"));
	process.env.LEGION_SCRATCHPAD_DIR = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.LEGION_SCRATCHPAD_DIR;
});

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

describe("scratchpad tissue", () => {
	it("registers scratchpad_capture and scratchpad_browse", async () => {
		const api = fakeApi();
		await scratchpadTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("scratchpad_capture");
		expect(names).toContain("scratchpad_browse");
	});

	it("appends a JSONL entry with id, timestamp, content, tags", async () => {
		const api = fakeApi();
		await scratchpadTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "scratchpad_capture");
		const result = await tool.execute("c1", {
			content: "first thought",
			tags: ["alpha", "beta"],
		});
		expect(result.details.ok).toBe(true);
		expect(result.details.id).toMatch(/[0-9a-f-]{36}/);

		const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
		expect(files.length).toBe(1);
		const body = readFileSync(join(dir, files[0]!), "utf8").trim();
		const parsed = JSON.parse(body);
		expect(parsed.content).toBe("first thought");
		expect(parsed.tags).toEqual(["alpha", "beta"]);
		expect(parsed.id).toMatch(/[0-9a-f-]{36}/);
		expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("scratchpad_browse returns latest entries newest-first", async () => {
		const api = fakeApi();
		await scratchpadTissue(api as any);
		const cap = api._registered.find((t: any) => t.name === "scratchpad_capture");
		await cap.execute("c1", { content: "one" });
		await cap.execute("c2", { content: "two" });
		await cap.execute("c3", { content: "three" });
		const browse = api._registered.find((t: any) => t.name === "scratchpad_browse");
		const r = await browse.execute("b1", { limit: 10 });
		expect(r.details.ok).toBe(true);
		const entries = r.details.entries as any[];
		expect(entries.length).toBe(3);
		expect(entries[0].content).toBe("three");
		expect(entries[1].content).toBe("two");
		expect(entries[2].content).toBe("one");
	});

	it("scratchpad_browse respects limit", async () => {
		const api = fakeApi();
		await scratchpadTissue(api as any);
		const cap = api._registered.find((t: any) => t.name === "scratchpad_capture");
		for (let i = 0; i < 5; i++) await cap.execute(`c${i}`, { content: `entry-${i}` });
		const browse = api._registered.find((t: any) => t.name === "scratchpad_browse");
		const r = await browse.execute("b1", { limit: 2 });
		expect((r.details.entries as any[]).length).toBe(2);
	});

	it("scratchpad_browse returns empty list when no files exist yet", async () => {
		const api = fakeApi();
		await scratchpadTissue(api as any);
		const browse = api._registered.find((t: any) => t.name === "scratchpad_browse");
		const r = await browse.execute("b1", {});
		expect(r.details.ok).toBe(true);
		expect((r.details.entries as any[]).length).toBe(0);
	});
});
