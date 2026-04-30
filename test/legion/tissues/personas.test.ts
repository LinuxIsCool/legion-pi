import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import personasTissue from "../../../extensions/legion/personas.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "legion-personas-"));
	writeFileSync(
		join(dir, "matt.character.yaml"),
		"identity:\n  slug: matt\n  name: Matt\n  version: 0.3.0\ndescription:\n  short: chief of staff\n",
		"utf8",
	);
	writeFileSync(
		join(dir, "shawn.character.yaml"),
		"identity:\n  slug: shawn\n  name: Shawn\n  version: 0.1.0\n",
		"utf8",
	);
	process.env.LEGION_PERSONAS_DIR = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.LEGION_PERSONAS_DIR;
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

describe("personas tissue", () => {
	it("registers persona_list and persona_recall", async () => {
		const api = fakeApi();
		await personasTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("persona_list");
		expect(names).toContain("persona_recall");
	});

	it("persona_list returns slug + name for every character file", async () => {
		const api = fakeApi();
		await personasTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "persona_list");
		const r = await tool.execute("p1", {});
		expect(r.details.ok).toBe(true);
		const slugs = (r.details.personas as any[]).map((p) => p.slug).sort();
		expect(slugs).toEqual(["matt", "shawn"]);
	});

	it("persona_recall returns the YAML body", async () => {
		const api = fakeApi();
		await personasTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "persona_recall");
		const r = await tool.execute("p2", { slug: "matt" });
		expect(r.details.ok).toBe(true);
		expect(r.details.yaml).toContain("slug: matt");
		expect(r.details.yaml).toContain("Matt");
	});

	it("persona_recall reports clear error for unknown slug", async () => {
		const api = fakeApi();
		await personasTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "persona_recall");
		const r = await tool.execute("p3", { slug: "does-not-exist" });
		expect(r.details.ok).toBe(false);
		expect(r.content[0].text.toLowerCase()).toMatch(/not found|unknown/);
	});
});
