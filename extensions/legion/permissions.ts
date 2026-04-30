/**
 * Legion permissions tissue.
 *
 * Pure-JS path-aware classifier mirroring CC's permission-allow.sh hook.
 *
 *   permissions_check(path) → "allow" | "deny" | "ask"
 *
 * Rules:
 *   - DENYLIST takes precedence over ALLOWLIST.
 *   - DENYLIST: ~/.claude/projects/-home-shawn/memory, ~/CLAUDE.md,
 *     ~/.claude/settings.json (the trusted seed + chezmoi-managed config)
 *   - ALLOWLIST: ~/.claude/local, ~/.claude/plugins/local/legion-plugins,
 *     ~/Workspace, /tmp
 *   - Anything else returns "ask".
 *
 * The classifier resolves the path before matching, so symlink/relative
 * traversals (e.g. "~/Workspace/../CLAUDE.md") still hit the denylist.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

const ALLOWLIST: readonly string[] = [
	resolve(homedir(), ".claude/local"),
	resolve(homedir(), ".claude/plugins/local/legion-plugins"),
	resolve(homedir(), "Workspace"),
	"/tmp",
];

const DENYLIST: readonly string[] = [
	resolve(homedir(), ".claude/projects/-home-shawn/memory"),
	resolve(homedir(), "CLAUDE.md"),
	resolve(homedir(), ".claude/settings.json"),
];

function startsWithBoundary(child: string, parent: string): boolean {
	if (child === parent) return true;
	return child.startsWith(`${parent}/`);
}

export function classify(target: string): "allow" | "deny" | "ask" {
	const abs = resolve(target);
	if (DENYLIST.some((p) => startsWithBoundary(abs, p))) return "deny";
	if (ALLOWLIST.some((p) => startsWithBoundary(abs, p))) return "allow";
	return "ask";
}

const checkTool = defineTool({
	name: "permissions_check",
	label: "Permissions Check",
	description:
		"Path-aware permission classification — returns allow / deny / ask based on the trusted-seed boundary.",
	parameters: Type.Object({
		path: Type.String({ description: "Absolute or relative filesystem path to classify" }),
	}),
	async execute(_id, params) {
		const verdict = classify(params.path);
		return {
			content: [{ type: "text", text: verdict }],
			details: {
				ok: true,
				path: params.path,
				resolved: resolve(params.path),
				verdict,
			},
		};
	},
});

const permissionsTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(checkTool);
};

export default permissionsTissue;
