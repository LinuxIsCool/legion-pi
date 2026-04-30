import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import venturesTissue from "../../../extensions/legion/ventures.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "legion-ventures-"));
	mkdirSync(join(dir, "active"), { recursive: true });
	mkdirSync(join(dir, "dormant"), { recursive: true });
	mkdirSync(join(dir, "exploring"), { recursive: true });
	writeFileSync(
		join(dir, "active", "alpha.md"),
		"---\nid: alpha\ntitle: Alpha Venture\nstage: active\npriority: high\n---\n\nbody alpha\n",
		"utf8",
	);
	writeFileSync(
		join(dir, "active", "beta.md"),
		"---\nid: beta\ntitle: Beta Project\nstage: active\npriority: medium\n---\n\nbody beta\n",
		"utf8",
	);
	writeFileSync(
		join(dir, "dormant", "gamma.md"),
		"---\nid: gamma\ntitle: Gamma\nstage: dormant\n---\n\nbody gamma\n",
		"utf8",
	);
	process.env.LEGION_VENTURES_DIR = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.LEGION_VENTURES_DIR;
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

describe("ventures tissue", () => {
	it("registers venture_status and venture_list", async () => {
		const api = fakeApi();
		await venturesTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("venture_status");
		expect(names).toContain("venture_list");
	});

	it("venture_list returns ventures with parsed frontmatter", async () => {
		const api = fakeApi();
		await venturesTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "venture_list");
		const r = await tool.execute("v1", {});
		expect(r.details.ok).toBe(true);
		const ventures = r.details.ventures as any[];
		const slugs = ventures.map((v) => v.slug).sort();
		expect(slugs).toEqual(["alpha", "beta", "gamma"]);
	});

	it("venture_list with active=true filters by stage", async () => {
		const api = fakeApi();
		await venturesTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "venture_list");
		const r = await tool.execute("v2", { active: true });
		expect(r.details.ok).toBe(true);
		const slugs = (r.details.ventures as any[]).map((v) => v.slug).sort();
		expect(slugs).toEqual(["alpha", "beta"]);
	});

	it("venture_status returns the named venture body", async () => {
		const api = fakeApi();
		await venturesTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "venture_status");
		const r = await tool.execute("s1", { slug: "alpha" });
		expect(r.details.ok).toBe(true);
		expect(r.details.frontmatter.title).toBe("Alpha Venture");
		expect(r.details.body).toContain("body alpha");
	});

	it("venture_status reports a clear error for unknown slug", async () => {
		const api = fakeApi();
		await venturesTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "venture_status");
		const r = await tool.execute("s2", { slug: "does-not-exist" });
		expect(r.details.ok).toBe(false);
		expect(r.content[0].text.toLowerCase()).toMatch(/not found|unknown/);
	});
});
