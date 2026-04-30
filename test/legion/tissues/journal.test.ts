import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import journalTissue from "../../../extensions/legion/journal.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "legion-journal-"));
	process.env.LEGION_JOURNAL_DIR = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.LEGION_JOURNAL_DIR;
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

function findFirstMd(root: string): string | null {
	const stack: string[] = [root];
	while (stack.length) {
		const p = stack.pop();
		if (!p) continue;
		const stats = statSync(p);
		if (stats.isDirectory()) {
			for (const child of readdirSync(p)) stack.push(join(p, child));
			continue;
		}
		if (p.endsWith(".md")) return p;
	}
	return null;
}

describe("journal tissue", () => {
	it("registers journal_append", async () => {
		const api = fakeApi();
		await journalTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("journal_append");
	});

	it("writes an atomic markdown file with frontmatter under the day directory", async () => {
		const api = fakeApi();
		await journalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "journal_append");
		expect(tool).toBeDefined();

		const result = await tool.execute("call-1", {
			content: "Hello from the test.",
			tags: ["test", "phase-3"],
		});
		expect(result.content[0].text).toContain("written");
		expect(result.details.path).toMatch(/\.md$/);

		const md = findFirstMd(dir);
		expect(md).not.toBeNull();
		const body = readFileSync(md as string, "utf8");
		expect(body).toMatch(/^---\n/);
		expect(body).toContain("tags: [test, phase-3]");
		expect(body).toContain("Hello from the test.");
		expect(body).toMatch(/date: \d{4}-\d{2}-\d{2}/);
		expect(body).toMatch(/time: \d{2}:\d{2} UTC/);
	});

	it("uses YYYY/MM/DD/HH-MM-<slug>.md layout", async () => {
		const api = fakeApi();
		await journalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "journal_append");
		const result = await tool.execute("call-2", {
			content: "Phase 3 close marker.",
		});
		const written = result.details.path as string;
		const rel = written.startsWith(dir) ? written.slice(dir.length).replace(/^\//, "") : written;
		expect(rel).toMatch(/^\d{4}\/\d{2}\/\d{2}\/\d{2}-\d{2}-.+\.md$/);
	});

	it("respects an explicit slug argument", async () => {
		const api = fakeApi();
		await journalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "journal_append");
		const result = await tool.execute("call-3", {
			content: "Some content with a wholly unrelated first line.",
			slug: "explicit-slug-here",
		});
		const path = result.details.path as string;
		expect(path).toContain("explicit-slug-here.md");
	});

	it("emits empty tags as 'tags: []' when none provided", async () => {
		const api = fakeApi();
		await journalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "journal_append");
		const result = await tool.execute("call-4", { content: "No tags here." });
		const body = readFileSync(result.details.path as string, "utf8");
		expect(body).toContain("tags: []");
	});
});
