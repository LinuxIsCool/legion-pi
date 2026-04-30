/**
 * Legion hippo tissue.
 *
 * Two tools backed by the FalkorDB-hosted `hippo` graph:
 *
 *   hippo_recall   1-hop associative recall over named entities
 *   hippo_index    MERGE a labelled entity into the graph
 *
 * Liveness check at session_start runs `redis-cli PING` inside the
 * `hippo-graph` container. Failure surfaces a single notify() but does
 * not block tool registration — the tools themselves degrade gracefully.
 *
 * Override the docker binary, container name, redis port, or graph name
 * via environment variables:
 *
 *   LEGION_HIPPO_DOCKER_BIN     default: docker
 *   LEGION_HIPPO_CONTAINER      default: hippo-graph
 *   LEGION_HIPPO_REDIS_PORT     default: 6379
 *   LEGION_HIPPO_GRAPH          default: hippo
 */
import { spawn } from "node:child_process";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function dockerBin(): string {
	return process.env.LEGION_HIPPO_DOCKER_BIN ?? "docker";
}

function container(): string {
	return process.env.LEGION_HIPPO_CONTAINER ?? "hippo-graph";
}

function redisPort(): string {
	return process.env.LEGION_HIPPO_REDIS_PORT ?? "6379";
}

function graphName(): string {
	return process.env.LEGION_HIPPO_GRAPH ?? "hippo";
}

interface RunResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	error?: string;
	code?: number | null;
}

async function runDocker(args: string[], timeoutMs = 30_000): Promise<RunResult> {
	return await new Promise((resolve) => {
		let child;
		try {
			child = spawn(dockerBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
		} catch (e) {
			resolve({
				ok: false,
				stdout: "",
				stderr: "",
				error: e instanceof Error ? e.message : String(e),
			});
			return;
		}
		let stdout = "";
		let stderr = "";
		let resolved = false;
		const timer = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// ignore
			}
			resolve({
				ok: false,
				stdout,
				stderr,
				error: `timed out after ${timeoutMs}ms`,
			});
		}, timeoutMs);
		child.stdout?.on("data", (b: Buffer) => {
			stdout += b.toString("utf8");
		});
		child.stderr?.on("data", (b: Buffer) => {
			stderr += b.toString("utf8");
		});
		child.on("error", (e) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			resolve({ ok: false, stdout, stderr, error: e.message });
		});
		child.on("close", (code) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			resolve({ ok: code === 0, stdout, stderr, code });
		});
	});
}

async function liveness(): Promise<{ ok: boolean; detail: string }> {
	const r = await runDocker(["exec", container(), "redis-cli", "-p", redisPort(), "PING"]);
	if (r.error) return { ok: false, detail: r.error };
	if (!r.ok) return { ok: false, detail: r.stderr.trim() || `exit ${r.code}` };
	return { ok: r.stdout.trim() === "PONG", detail: r.stdout.trim() };
}

async function cypher(query: string): Promise<RunResult> {
	return await runDocker([
		"exec",
		container(),
		"redis-cli",
		"-p",
		redisPort(),
		"GRAPH.QUERY",
		graphName(),
		query,
		"--no-raw",
	]);
}

const recallTool = defineTool({
	name: "hippo_recall",
	label: "Hippo Recall",
	description: "1-hop associative recall over the FalkorDB knowledge graph.",
	parameters: Type.Object({
		query: Type.String({ description: "Substring to search entity names for" }),
		hops: Type.Optional(Type.Number({ description: "Reserved (currently 1-hop only)" })),
	}),
	async execute(_id, params) {
		const escaped = params.query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const cy =
			`MATCH (e) WHERE toLower(e.name) CONTAINS toLower("${escaped}") ` +
			`OPTIONAL MATCH (e)-[r]-(n) ` +
			`RETURN e.name AS root, type(r) AS rel, n.name AS target LIMIT 50`;
		const r = await cypher(cy);
		if (!r.ok) {
			const msg = r.error ?? r.stderr.trim() ?? `exit ${r.code}`;
			return {
				content: [{ type: "text", text: `hippo_recall failed: ${msg}` }],
				details: { ok: false, error: msg, cypher: cy },
			};
		}
		return {
			content: [{ type: "text", text: r.stdout.trim() || "(no rows)" }],
			details: { ok: true, cypher: cy },
		};
	},
});

const indexTool = defineTool({
	name: "hippo_index",
	label: "Hippo Index",
	description: "MERGE a labelled entity into the knowledge graph.",
	parameters: Type.Object({
		name: Type.String({ description: "Entity name (used as the MERGE key)" }),
		type: Type.Optional(Type.String({ description: "Node label (default: Entity)" })),
	}),
	async execute(_id, params) {
		const escapedName = params.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const label = (params.type ?? "Entity").replace(/[^A-Za-z0-9_]/g, "");
		const safeLabel = label || "Entity";
		const cy = `MERGE (e:${safeLabel} {name: "${escapedName}"}) RETURN e.name`;
		const r = await cypher(cy);
		if (!r.ok) {
			const msg = r.error ?? r.stderr.trim() ?? `exit ${r.code}`;
			return {
				content: [{ type: "text", text: `hippo_index failed: ${msg}` }],
				details: { ok: false, error: msg, cypher: cy },
			};
		}
		return {
			content: [{ type: "text", text: r.stdout.trim() || "(ok)" }],
			details: { ok: true, cypher: cy },
		};
	},
});

const hippoTissue: ExtensionFactory = async (pi) => {
	pi.on("session_start", async (_event, ctx) => {
		const probe = await liveness();
		if (!probe.ok) {
			ctx.ui.notify(
				`legion: tissue 'hippo' offline (${container()} unreachable: ${probe.detail})`,
				"warning",
			);
		}
	});

	pi.registerTool(recallTool);
	pi.registerTool(indexTool);
};

export default hippoTissue;
