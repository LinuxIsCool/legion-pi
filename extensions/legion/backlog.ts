/**
 * Legion backlog tissue.
 *
 * Markdown-with-YAML-frontmatter tasks under
 *
 *   $LEGION_BACKLOG_DIR/<id>-<slug>.md
 *
 * Defaults to ~/.claude/local/backlog when LEGION_BACKLOG_DIR is unset.
 *
 * Tools:
 *
 *   backlog_create(title, priority, body?, status?)
 *   backlog_get(id)
 *   backlog_list(status?)
 *   backlog_update(id, status?, priority?)
 *
 * The frontmatter parser is intentionally minimal: it only knows the
 * fields this tissue writes. External edits in unsupported keys
 * survive as `body` (they will appear after the frontmatter block).
 */
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function rootDir(): string {
	return process.env.LEGION_BACKLOG_DIR ?? join(homedir(), ".claude/local/backlog");
}

function slugify(s: string): string {
	const cleaned = s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50);
	return cleaned || "untitled";
}

interface Task {
	id: number;
	title: string;
	status: string;
	priority: string;
	created: string;
	updated: string;
	modified_count: number;
	body: string;
	path: string;
}

function escapeYamlScalar(s: string): string {
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderFrontmatter(t: Omit<Task, "body" | "path">): string {
	return (
		`---\n` +
		`id: ${t.id}\n` +
		`title: ${escapeYamlScalar(t.title)}\n` +
		`status: ${t.status}\n` +
		`priority: ${t.priority}\n` +
		`created: ${t.created}\n` +
		`updated: ${t.updated}\n` +
		`modified_count: ${t.modified_count}\n` +
		`---\n`
	);
}

function parseTaskFile(path: string): Task | null {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return null;
	}
	if (!raw.startsWith("---\n")) return null;
	const end = raw.indexOf("\n---\n", 4);
	if (end < 0) return null;
	const fmRaw = raw.slice(4, end);
	const body = raw.slice(end + 5);
	const fm: Record<string, string> = {};
	for (const line of fmRaw.split("\n")) {
		const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
		if (!m) continue;
		fm[m[1]!] = m[2]!.trim();
	}
	const idStr = fm.id;
	if (idStr === undefined) return null;
	const id = Number(idStr);
	if (!Number.isFinite(id)) return null;
	const titleRaw = fm.title ?? "";
	const title =
		titleRaw.startsWith('"') && titleRaw.endsWith('"')
			? titleRaw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
			: titleRaw;
	return {
		id,
		title,
		status: fm.status ?? "To Do",
		priority: fm.priority ?? "medium",
		created: fm.created ?? "",
		updated: fm.updated ?? "",
		modified_count: Number(fm.modified_count ?? "0") || 0,
		body,
		path,
	};
}

function listAllTasks(dir: string): Task[] {
	if (!existsSync(dir)) return [];
	const out: Task[] = [];
	for (const f of readdirSync(dir)) {
		if (!f.endsWith(".md")) continue;
		const t = parseTaskFile(join(dir, f));
		if (t) out.push(t);
	}
	return out;
}

function nextId(dir: string): number {
	if (!existsSync(dir)) return 1;
	let max = 0;
	for (const f of readdirSync(dir)) {
		const m = /^(\d+)-/.exec(f);
		if (m) {
			const n = Number(m[1]);
			if (Number.isFinite(n) && n > max) max = n;
		}
	}
	return max + 1;
}

function atomicWrite(dest: string, body: string): void {
	const tmp = join(tmpdir(), `legion-backlog-${randomUUID()}.md`);
	writeFileSync(tmp, body, "utf8");
	renameSync(tmp, dest);
}

const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];

const createTool = defineTool({
	name: "backlog_create",
	label: "Backlog Create",
	description: "Create a new backlog task as a markdown file with YAML frontmatter.",
	parameters: Type.Object({
		title: Type.String({ description: "Short task title" }),
		priority: Type.String({ description: "low | medium | high | urgent" }),
		body: Type.Optional(Type.String({ description: "Optional markdown body" })),
		status: Type.Optional(Type.String({ description: "Initial status (default: 'To Do')" })),
	}),
	async execute(_id, params) {
		const dir = rootDir();
		try {
			mkdirSync(dir, { recursive: true });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `backlog_create failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		const priority = VALID_PRIORITIES.includes(params.priority) ? params.priority : "medium";
		const id = nextId(dir);
		const now = new Date().toISOString();
		const status = params.status ?? "To Do";
		const slug = slugify(params.title);
		const filename = `${id}-${slug}.md`;
		const dest = join(dir, filename);
		const fm = renderFrontmatter({
			id,
			title: params.title,
			status,
			priority,
			created: now,
			updated: now,
			modified_count: 0,
		});
		const body = params.body ? `\n${params.body}\n` : "\n";
		try {
			atomicWrite(dest, fm + body);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `backlog_create failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		return {
			content: [{ type: "text", text: `backlog: created ${filename}` }],
			details: { ok: true, id, path: dest },
		};
	},
});

const getTool = defineTool({
	name: "backlog_get",
	label: "Backlog Get",
	description: "Read a single backlog task by numeric id.",
	parameters: Type.Object({
		id: Type.Number({ description: "Numeric task id" }),
	}),
	async execute(_id, params) {
		const dir = rootDir();
		if (!existsSync(dir)) {
			return {
				content: [{ type: "text", text: `backlog_get: dir missing` }],
				details: { ok: false, error: "dir missing" },
			};
		}
		for (const f of readdirSync(dir)) {
			if (!f.startsWith(`${params.id}-`) || !f.endsWith(".md")) continue;
			const t = parseTaskFile(join(dir, f));
			if (!t) continue;
			if (t.id !== params.id) continue;
			return {
				content: [{ type: "text", text: JSON.stringify(t, null, 2) }],
				details: { ok: true, task: t },
			};
		}
		return {
			content: [{ type: "text", text: `backlog_get: id ${params.id} not found` }],
			details: { ok: false, error: "not found" },
		};
	},
});

const listTool = defineTool({
	name: "backlog_list",
	label: "Backlog List",
	description: "List all backlog tasks, optionally filtered by status.",
	parameters: Type.Object({
		status: Type.Optional(Type.String({ description: "Optional status filter" })),
	}),
	async execute(_id, params) {
		const dir = rootDir();
		const all = listAllTasks(dir);
		const tasks = params.status ? all.filter((t) => t.status === params.status) : all;
		tasks.sort((a, b) => a.id - b.id);
		return {
			content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
			details: { ok: true, tasks },
		};
	},
});

const updateTool = defineTool({
	name: "backlog_update",
	label: "Backlog Update",
	description: "Update status and/or priority of a backlog task.",
	parameters: Type.Object({
		id: Type.Number({ description: "Numeric task id" }),
		status: Type.Optional(Type.String({ description: "New status" })),
		priority: Type.Optional(Type.String({ description: "low | medium | high | urgent" })),
	}),
	async execute(_id, params) {
		const dir = rootDir();
		if (!existsSync(dir)) {
			return {
				content: [{ type: "text", text: "backlog_update: dir missing" }],
				details: { ok: false, error: "dir missing" },
			};
		}
		let foundPath: string | null = null;
		let found: Task | null = null;
		for (const f of readdirSync(dir)) {
			if (!f.startsWith(`${params.id}-`) || !f.endsWith(".md")) continue;
			const p = join(dir, f);
			const t = parseTaskFile(p);
			if (t && t.id === params.id) {
				foundPath = p;
				found = t;
				break;
			}
		}
		if (!found || !foundPath) {
			return {
				content: [{ type: "text", text: `backlog_update: id ${params.id} not found` }],
				details: { ok: false, error: "not found" },
			};
		}
		const next: Task = {
			...found,
			status: params.status ?? found.status,
			priority:
				params.priority && VALID_PRIORITIES.includes(params.priority)
					? params.priority
					: found.priority,
			updated: new Date().toISOString(),
			modified_count: found.modified_count + 1,
		};
		const fm = renderFrontmatter({
			id: next.id,
			title: next.title,
			status: next.status,
			priority: next.priority,
			created: next.created,
			updated: next.updated,
			modified_count: next.modified_count,
		});
		try {
			atomicWrite(foundPath, fm + next.body);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `backlog_update failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		return {
			content: [{ type: "text", text: `backlog: updated ${params.id}` }],
			details: { ok: true, task: next },
		};
	},
});

const backlogTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(createTool);
	pi.registerTool(getTool);
	pi.registerTool(listTool);
	pi.registerTool(updateTool);
};

export default backlogTissue;
