import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import backlogTissue from "../../../extensions/legion/backlog.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "legion-backlog-"));
	process.env.LEGION_BACKLOG_DIR = dir;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	delete process.env.LEGION_BACKLOG_DIR;
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

describe("backlog tissue", () => {
	it("registers backlog_create, backlog_get, backlog_list, backlog_update", async () => {
		const api = fakeApi();
		await backlogTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("backlog_create");
		expect(names).toContain("backlog_get");
		expect(names).toContain("backlog_list");
		expect(names).toContain("backlog_update");
	});

	it("backlog_create writes a markdown file with YAML frontmatter and assigns numeric id", async () => {
		const api = fakeApi();
		await backlogTissue(api as any);
		const create = api._registered.find((t: any) => t.name === "backlog_create");
		const r = await create.execute("c1", {
			title: "First task ever",
			priority: "high",
			body: "Do the thing.",
		});
		expect(r.details.ok).toBe(true);
		const id = r.details.id as number;
		expect(typeof id).toBe("number");
		expect(id).toBeGreaterThanOrEqual(1);
		const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
		expect(files.length).toBe(1);
		const body = readFileSync(join(dir, files[0]!), "utf8");
		expect(body).toMatch(/^---\n/);
		expect(body).toContain(`id: ${id}`);
		expect(body).toContain('title: "First task ever"');
		expect(body).toContain("priority: high");
		expect(body).toContain("status: To Do");
		expect(body).toContain("Do the thing.");
	});

	it("backlog_create increments id over existing files", async () => {
		writeFileSync(join(dir, "100-pre-existing.md"), "---\nid: 100\n---\n");
		const api = fakeApi();
		await backlogTissue(api as any);
		const create = api._registered.find((t: any) => t.name === "backlog_create");
		const r = await create.execute("c1", { title: "Next one", priority: "low" });
		expect(r.details.id).toBe(101);
	});

	it("backlog_get returns the parsed task", async () => {
		const api = fakeApi();
		await backlogTissue(api as any);
		const create = api._registered.find((t: any) => t.name === "backlog_create");
		const get = api._registered.find((t: any) => t.name === "backlog_get");
		const c = await create.execute("c1", {
			title: "Lookup target",
			priority: "medium",
			body: "Body content.",
		});
		const id = c.details.id as number;
		const r = await get.execute("g1", { id });
		expect(r.details.ok).toBe(true);
		expect(r.details.task.id).toBe(id);
		expect(r.details.task.title).toBe("Lookup target");
		expect(r.details.task.status).toBe("To Do");
		expect(r.details.task.body).toContain("Body content.");
	});

	it("backlog_get returns ok=false for missing id", async () => {
		const api = fakeApi();
		await backlogTissue(api as any);
		const get = api._registered.find((t: any) => t.name === "backlog_get");
		const r = await get.execute("g1", { id: 99999 });
		expect(r.details.ok).toBe(false);
	});

	it("backlog_list returns all tasks, optionally filtered by status", async () => {
		const api = fakeApi();
		await backlogTissue(api as any);
		const create = api._registered.find((t: any) => t.name === "backlog_create");
		const update = api._registered.find((t: any) => t.name === "backlog_update");
		const list = api._registered.find((t: any) => t.name === "backlog_list");
		const a = await create.execute("c1", { title: "Task A", priority: "low" });
		await create.execute("c2", { title: "Task B", priority: "low" });
		await update.execute("u1", { id: a.details.id, status: "Done" });

		const allR = await list.execute("l1", {});
		expect((allR.details.tasks as any[]).length).toBe(2);

		const doneR = await list.execute("l2", { status: "Done" });
		expect((doneR.details.tasks as any[]).length).toBe(1);
		expect((doneR.details.tasks as any[])[0].title).toBe("Task A");

		const todoR = await list.execute("l3", { status: "To Do" });
		expect((todoR.details.tasks as any[]).length).toBe(1);
		expect((todoR.details.tasks as any[])[0].title).toBe("Task B");
	});

	it("backlog_update mutates status and priority and bumps modified_count", async () => {
		const api = fakeApi();
		await backlogTissue(api as any);
		const create = api._registered.find((t: any) => t.name === "backlog_create");
		const update = api._registered.find((t: any) => t.name === "backlog_update");
		const get = api._registered.find((t: any) => t.name === "backlog_get");
		const c = await create.execute("c1", { title: "Bumpable", priority: "low" });
		const id = c.details.id as number;
		await update.execute("u1", { id, status: "In Progress", priority: "high" });
		const r = await get.execute("g1", { id });
		expect(r.details.task.status).toBe("In Progress");
		expect(r.details.task.priority).toBe("high");
		expect(r.details.task.modified_count).toBe(1);
	});
});
