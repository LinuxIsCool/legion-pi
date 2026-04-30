import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import inventoryTissue from "../../../extensions/legion/inventory.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "legion-inventory-"));
	mkdirSync(join(dir, "machines"), { recursive: true });
	mkdirSync(join(dir, "drives"), { recursive: true });
	writeFileSync(
		join(dir, "machines", "legion.md"),
		"---\nid: legion\nname: Lenovo Legion T5\ntype: machine\nstatus: active\nbackup_status: partial\n---\n\nbody legion\n",
		"utf8",
	);
	writeFileSync(
		join(dir, "machines", "mothership.md"),
		"---\nid: mothership\nname: Mothership\ntype: machine\nstatus: offline\nbackup_status: none\n---\n\nbody mothership\n",
		"utf8",
	);
	writeFileSync(
		join(dir, "drives", "ssd.json"),
		JSON.stringify({ id: "ssd", name: "Samsung SSD", type: "drive", status: "active" }),
		"utf8",
	);
	process.env.LEGION_INVENTORY_DIR = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.LEGION_INVENTORY_DIR;
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

describe("inventory tissue", () => {
	it("registers asset_list and asset_health", async () => {
		const api = fakeApi();
		await inventoryTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("asset_list");
		expect(names).toContain("asset_health");
	});

	it("asset_list discovers assets across categories (md + json)", async () => {
		const api = fakeApi();
		await inventoryTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "asset_list");
		const r = await tool.execute("a1", {});
		expect(r.details.ok).toBe(true);
		const ids = (r.details.assets as any[]).map((a) => a.slug).sort();
		expect(ids).toEqual(["legion", "mothership", "ssd"]);
	});

	it("asset_list with category filter returns only that category", async () => {
		const api = fakeApi();
		await inventoryTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "asset_list");
		const r = await tool.execute("a2", { category: "machines" });
		const ids = (r.details.assets as any[]).map((a) => a.slug).sort();
		expect(ids).toEqual(["legion", "mothership"]);
	});

	it("asset_health summarizes status counts", async () => {
		const api = fakeApi();
		await inventoryTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "asset_health");
		const r = await tool.execute("h1", {});
		expect(r.details.ok).toBe(true);
		const summary = r.details.summary as any;
		expect(summary.total).toBe(3);
		expect(summary.by_status.active).toBe(2);
		expect(summary.by_status.offline).toBe(1);
	});
});
