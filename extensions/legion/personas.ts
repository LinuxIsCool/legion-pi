/**
 * Legion personas tissue.
 *
 * Two read-only tools backed by the filesystem at $LEGION_PERSONAS_DIR
 * (default ~/.claude/plugins/local/legion-plugins/plugins/claude-personas/personas/characters/).
 * Each persona is a YAML file `<slug>.character.yaml`.
 *
 * Tools:
 *   persona_list()         list every persona (slug + name + version)
 *   persona_recall(slug)   fetch a persona's full YAML body
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function rootDir(): string {
	return (
		process.env.LEGION_PERSONAS_DIR ??
		join(
			homedir(),
			".claude/plugins/local/legion-plugins/plugins/claude-personas/personas/characters",
		)
	);
}

interface PersonaSummary {
	slug: string;
	name: string;
	version: string;
	path: string;
}

/**
 * Extract a top-level YAML scalar value under `identity:` block. Hand-rolled
 * to avoid pulling in a YAML dependency for what is effectively grep.
 */
function extractIdentityField(yaml: string, key: string): string | undefined {
	const lines = yaml.split("\n");
	let inIdentity = false;
	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, "");
		if (/^identity\s*:/.test(line)) {
			inIdentity = true;
			continue;
		}
		if (inIdentity) {
			// New top-level block ends the identity section
			if (/^[A-Za-z0-9_-]+\s*:/.test(line) && !/^\s/.test(line)) {
				inIdentity = false;
				continue;
			}
			const m = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
			if (m && m[1] === key) {
				return m[2]!.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
			}
		}
	}
	return undefined;
}

function listPersonas(root: string): PersonaSummary[] {
	if (!existsSync(root)) return [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return [];
	}
	const out: PersonaSummary[] = [];
	for (const f of entries) {
		if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
		const path = join(root, f);
		try {
			if (!statSync(path).isFile()) continue;
		} catch {
			continue;
		}
		let body: string;
		try {
			body = readFileSync(path, "utf8");
		} catch {
			continue;
		}
		// Filename pattern: "<slug>.character.yaml" or "<slug>.yaml"
		const slug = f
			.replace(/\.character\.ya?ml$/i, "")
			.replace(/\.ya?ml$/i, "");
		out.push({
			slug,
			name: extractIdentityField(body, "name") ?? slug,
			version: extractIdentityField(body, "version") ?? "",
			path,
		});
	}
	return out;
}

function findPersonaPath(root: string, slug: string): string | null {
	const candidates = [
		join(root, `${slug}.character.yaml`),
		join(root, `${slug}.character.yml`),
		join(root, `${slug}.yaml`),
		join(root, `${slug}.yml`),
	];
	for (const p of candidates) {
		if (existsSync(p)) return p;
	}
	return null;
}

const listTool = defineTool({
	name: "persona_list",
	label: "Persona List",
	description: "List every persona character file (slug, name, version).",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const personas = listPersonas(rootDir());
		return {
			content: [{ type: "text", text: JSON.stringify(personas, null, 2) }],
			details: { ok: true, personas },
		};
	},
});

const recallTool = defineTool({
	name: "persona_recall",
	label: "Persona Recall",
	description: "Return the YAML body of a single persona by slug.",
	parameters: Type.Object({
		slug: Type.String({ description: "Persona slug (filename minus .character.yaml)" }),
	}),
	async execute(_id, params) {
		const path = findPersonaPath(rootDir(), params.slug);
		if (!path) {
			return {
				content: [{ type: "text", text: `persona_recall: '${params.slug}' not found` }],
				details: { ok: false, error: `persona not found: ${params.slug}` },
			};
		}
		let yaml: string;
		try {
			yaml = readFileSync(path, "utf8");
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `persona_recall read failed: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
		return {
			content: [{ type: "text", text: yaml }],
			details: { ok: true, slug: params.slug, path, yaml },
		};
	},
});

const personasTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(listTool);
	pi.registerTool(recallTool);
};

export default personasTissue;
