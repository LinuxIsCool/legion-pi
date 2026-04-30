/**
 * Legion journal tissue.
 *
 * One tool: `journal_append(content, tags?, slug?)`. Writes a markdown
 * file with YAML frontmatter under
 *
 *   $LEGION_JOURNAL_DIR/<YYYY>/<MM>/<DD>/<HH>-<MM>-<slug>.md
 *
 * Defaults to ~/.claude/local/journal/legion when LEGION_JOURNAL_DIR is unset.
 *
 * Atomic write semantics: the body is written to a temp file under
 * os.tmpdir(), then renameSync()'d into place. A failed write leaves no
 * partial file in the journal tree.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function dirRoot(): string {
	return process.env.LEGION_JOURNAL_DIR ?? join(homedir(), ".claude/local/journal/legion");
}

function slugify(s: string): string {
	const cleaned = s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50);
	return cleaned || "untitled";
}

const journalAppendTool = defineTool({
	name: "journal_append",
	label: "Journal Append",
	description: "Write an atomic markdown journal entry with YAML frontmatter under the day directory.",
	parameters: Type.Object({
		content: Type.String({ description: "Markdown body to write under the frontmatter" }),
		tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tag list" })),
		slug: Type.Optional(Type.String({ description: "Override the auto-derived slug" })),
	}),
	async execute(_id, params) {
		const now = new Date();
		const yyyy = String(now.getUTCFullYear());
		const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
		const dd = String(now.getUTCDate()).padStart(2, "0");
		const hh = String(now.getUTCHours()).padStart(2, "0");
		const mn = String(now.getUTCMinutes()).padStart(2, "0");

		const dayDir = join(dirRoot(), yyyy, mm, dd);
		mkdirSync(dayDir, { recursive: true });

		const firstLine = params.content.split("\n")[0] ?? "";
		const slug = params.slug ? slugify(params.slug) : slugify(firstLine);
		const filename = `${hh}-${mn}-${slug}.md`;

		const tagLine =
			params.tags && params.tags.length ? `tags: [${params.tags.join(", ")}]` : "tags: []";

		const body =
			`---\n` +
			`title: ${slug}\n` +
			`date: ${yyyy}-${mm}-${dd}\n` +
			`time: ${hh}:${mn} UTC\n` +
			`${tagLine}\n` +
			`---\n\n` +
			`${params.content}\n`;

		const tmp = join(tmpdir(), `legion-journal-${randomUUID()}.md`);
		const dest = join(dayDir, filename);
		try {
			writeFileSync(tmp, body, "utf8");
			renameSync(tmp, dest);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `journal_append failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}

		return {
			content: [{ type: "text", text: `journal: written ${dest}` }],
			details: { ok: true, path: dest },
		};
	},
});

const journalTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(journalAppendTool);
};

export default journalTissue;
