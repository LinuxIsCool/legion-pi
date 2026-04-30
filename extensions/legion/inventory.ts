/**
 * Legion inventory tissue.
 *
 * Two read-only tools backed by the filesystem at $LEGION_INVENTORY_DIR
 * (default ~/.claude/local/inventory/assets/). Each asset is either:
 *
 *   <root>/<category>/<slug>.md     markdown with YAML frontmatter
 *   <root>/<category>/<slug>.json   plain JSON document
 *
 * Tools:
 *   asset_list(category?)   list assets, optionally filter by category
 *   asset_health()          summary counts grouped by status
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function rootDir(): string {
	return process.env.LEGION_INVENTORY_DIR ?? join(homedir(), ".claude/local/inventory/assets");
}

interface AssetEntry {
	slug: string;
	category: string;
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
		if (rawLine.startsWith(" ") || rawLine.startsWith("\t") || rawLine.startsWith("-")) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key) continue;
		fm[key] = value;
	}
	return { frontmatter: fm, body: m[2] ?? "" };
}

function discoverAssets(root: string, categoryFilter?: string): AssetEntry[] {
	if (!existsSync(root)) return [];
	const out: AssetEntry[] = [];
	let categories: string[];
	try {
		categories = readdirSync(root).filter((d) => {
			try {
				return statSync(join(root, d)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
	for (const category of categories) {
		if (categoryFilter && category !== categoryFilter) continue;
		const dir = join(root, category);
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const f of entries) {
			const path = join(dir, f);
			let body: string;
			try {
				if (!statSync(path).isFile()) continue;
				body = readFileSync(path, "utf8");
			} catch {
				continue;
			}
			let slug: string;
			let frontmatter: Record<string, unknown>;
			if (f.endsWith(".md")) {
				slug = f.slice(0, -3);
				frontmatter = parseFrontmatter(body).frontmatter;
			} else if (f.endsWith(".json")) {
				slug = f.slice(0, -5);
				try {
					const parsed = JSON.parse(body);
					frontmatter = (parsed && typeof parsed === "object") ? (parsed as Record<string, unknown>) : {};
				} catch {
					frontmatter = {};
				}
			} else {
				continue;
			}
			out.push({ slug, category, path, frontmatter });
		}
	}
	return out;
}

const listTool = defineTool({
	name: "asset_list",
	label: "Asset List",
	description: "List inventoried assets across categories.",
	parameters: Type.Object({
		category: Type.Optional(
			Type.String({
				description: "Optional category filter (e.g. 'machines', 'drives', 'venues')",
			}),
		),
	}),
	async execute(_id, params) {
		const assets = discoverAssets(rootDir(), params.category);
		return {
			content: [{ type: "text", text: JSON.stringify(assets, null, 2) }],
			details: { ok: true, assets },
		};
	},
});

const healthTool = defineTool({
	name: "asset_health",
	label: "Asset Health",
	description: "Summarize asset health counts by status and category.",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const assets = discoverAssets(rootDir());
		const byStatus: Record<string, number> = {};
		const byCategory: Record<string, number> = {};
		for (const a of assets) {
			const status = String(a.frontmatter.status ?? "unknown");
			byStatus[status] = (byStatus[status] ?? 0) + 1;
			byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
		}
		const summary = {
			total: assets.length,
			by_status: byStatus,
			by_category: byCategory,
		};
		return {
			content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
			details: { ok: true, summary },
		};
	},
});

const inventoryTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(listTool);
	pi.registerTool(healthTool);
};

export default inventoryTissue;
