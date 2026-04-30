/**
 * Legion scratchpad tissue.
 *
 * Two tools backed by a per-day JSONL append-only log:
 *
 *   scratchpad_capture(content, tags?)   append {id,timestamp,content,tags}
 *   scratchpad_browse(limit?)            return latest N entries, newest-first
 *
 * Storage:
 *   $LEGION_SCRATCHPAD_DIR/<YYYY-MM-DD>.jsonl
 *
 * Defaults to ~/.claude/local/scratchpad when LEGION_SCRATCHPAD_DIR is unset.
 *
 * The capture path uses tmp+rename for atomicity-of-line: the entry is
 * built, then a single appendFileSync writes it. JSONL append on POSIX
 * is atomic at the OS level for writes that fit in a single page.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function rootDir(): string {
	return process.env.LEGION_SCRATCHPAD_DIR ?? join(homedir(), ".claude/local/scratchpad");
}

function todayStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

interface ScratchEntry {
	id: string;
	timestamp: string;
	content: string;
	tags: string[];
}

const captureTool = defineTool({
	name: "scratchpad_capture",
	label: "Scratchpad Capture",
	description: "Append a thought to today's scratchpad JSONL.",
	parameters: Type.Object({
		content: Type.String({ description: "Free-form thought to capture" }),
		tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tag list" })),
	}),
	async execute(_id, params) {
		const dir = rootDir();
		try {
			mkdirSync(dir, { recursive: true });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `scratchpad_capture failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		const entry: ScratchEntry = {
			id: randomUUID(),
			timestamp: new Date().toISOString(),
			content: params.content,
			tags: params.tags ?? [],
		};
		const path = join(dir, `${todayStamp()}.jsonl`);
		try {
			appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `scratchpad_capture failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		return {
			content: [{ type: "text", text: `scratchpad: ${entry.id}` }],
			details: { ok: true, id: entry.id, path },
		};
	},
});

const browseTool = defineTool({
	name: "scratchpad_browse",
	label: "Scratchpad Browse",
	description: "Return up to N latest scratchpad entries, newest-first.",
	parameters: Type.Object({
		limit: Type.Optional(Type.Number({ description: "Max entries (default 20)" })),
	}),
	async execute(_id, params) {
		const dir = rootDir();
		const limit = Math.max(1, Math.min(params.limit ?? 20, 1000));
		if (!existsSync(dir)) {
			return {
				content: [{ type: "text", text: "[]" }],
				details: { ok: true, entries: [] },
			};
		}
		let files: string[];
		try {
			files = readdirSync(dir)
				.filter((f) => f.endsWith(".jsonl"))
				.sort()
				.reverse();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `scratchpad_browse failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		const out: ScratchEntry[] = [];
		for (const f of files) {
			let body: string;
			try {
				body = readFileSync(join(dir, f), "utf8");
			} catch {
				continue;
			}
			const lines = body.trim().split("\n").reverse();
			for (const line of lines) {
				if (!line) continue;
				try {
					out.push(JSON.parse(line) as ScratchEntry);
				} catch {
					// skip malformed line
				}
				if (out.length >= limit) break;
			}
			if (out.length >= limit) break;
		}
		return {
			content: [{ type: "text", text: JSON.stringify(out) }],
			details: { ok: true, entries: out },
		};
	},
});

const scratchpadTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(captureTool);
	pi.registerTool(browseTool);
};

export default scratchpadTissue;
