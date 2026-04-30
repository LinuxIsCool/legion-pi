/**
 * Legion ventures tissue.
 *
 * Two read-only tools backed by the filesystem at $LEGION_VENTURES_DIR
 * (default ~/.claude/local/ventures/). Each venture is a markdown file
 * with YAML frontmatter, organized by stage:
 *
 *   <root>/active/<slug>.md
 *   <root>/dormant/<slug>.md
 *   <root>/exploring/<slug>.md
 *   <root>/harvesting/<slug>.md
 *   <root>/seed/<slug>.md
 *   <root>/sustaining/<slug>.md
 *
 * Tools:
 *   venture_list(active?)   list ventures, optionally filter to active stage
 *   venture_status(slug)    return frontmatter + body for a single venture
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

const STAGE_DIRS = ["active", "dormant", "exploring", "harvesting", "seed", "sustaining"];

function rootDir(): string {
	return process.env.LEGION_VENTURES_DIR ?? join(homedir(), ".claude/local/ventures");
}

interface VentureEntry {
	slug: string;
	stage: string;
	path: string;
	frontmatter: Record<string, unknown>;
}

function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!m) return { frontmatter: {}, body: text };
	const fm: Record<string, unknown> = {};
	for (const rawLine of m[1]!.split("\n")) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf(":");
		if (idx < 0) continue;
		// Skip nested-list items (indented or starts with "-")
		if (rawLine.startsWith(" ") || rawLine.startsWith("\t") || rawLine.startsWith("-")) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key) continue;
		fm[key] = value;
	}
	return { frontmatter: fm, body: m[2] ?? "" };
}

function discoverVentures(root: string): VentureEntry[] {
	if (!existsSync(root)) return [];
	const out: VentureEntry[] = [];
	for (const stage of STAGE_DIRS) {
		const stageDir = join(root, stage);
		if (!existsSync(stageDir)) continue;
		let entries: string[];
		try {
			entries = readdirSync(stageDir);
		} catch {
			continue;
		}
		for (const f of entries) {
			if (!f.endsWith(".md")) continue;
			const path = join(stageDir, f);
			let body: string;
			try {
				if (!statSync(path).isFile()) continue;
				body = readFileSync(path, "utf8");
			} catch {
				continue;
			}
			const { frontmatter } = parseFrontmatter(body);
			const slug = f.slice(0, -3);
			out.push({ slug, stage, path, frontmatter });
		}
	}
	return out;
}

const listTool = defineTool({
	name: "venture_list",
	label: "Venture List",
	description: "List all ventures discovered on disk, with optional active-only filter.",
	parameters: Type.Object({
		active: Type.Optional(
			Type.Boolean({ description: "If true, only return ventures with stage=active" }),
		),
	}),
	async execute(_id, params) {
		const ventures = discoverVentures(rootDir());
		const filtered = params.active ? ventures.filter((v) => v.stage === "active") : ventures;
		return {
			content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
			details: { ok: true, ventures: filtered },
		};
	},
});

const statusTool = defineTool({
	name: "venture_status",
	label: "Venture Status",
	description: "Return frontmatter + body of a single venture, by slug.",
	parameters: Type.Object({
		slug: Type.String({ description: "Venture slug (filename without .md)" }),
	}),
	async execute(_id, params) {
		const root = rootDir();
		for (const stage of STAGE_DIRS) {
			const path = join(root, stage, `${params.slug}.md`);
			if (!existsSync(path)) continue;
			let body: string;
			try {
				body = readFileSync(path, "utf8");
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return {
					content: [{ type: "text", text: `venture_status read failed: ${msg}` }],
					details: { ok: false, error: msg },
				};
			}
			const parsed = parseFrontmatter(body);
			return {
				content: [
					{
						type: "text",
						text: `# ${params.slug} (${stage})\n\n${body}`,
					},
				],
				details: {
					ok: true,
					slug: params.slug,
					stage,
					path,
					frontmatter: parsed.frontmatter,
					body: parsed.body,
				},
			};
		}
		return {
			content: [{ type: "text", text: `venture_status: '${params.slug}' not found` }],
			details: { ok: false, error: `venture not found: ${params.slug}` },
		};
	},
});

const venturesTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(listTool);
	pi.registerTool(statusTool);
};

export default venturesTissue;
