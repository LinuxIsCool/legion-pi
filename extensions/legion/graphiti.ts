/**
 * Legion graphiti tissue.
 *
 * One tool backed by the FalkorDB-hosted `graphiti` graph (bi-temporal
 * knowledge graph maintained by Zep's graphiti library):
 *
 *   graphiti_recall   substring recall over named entities, optionally
 *                     filtered to facts valid at a given point in time.
 *
 * Liveness check at session_start runs `redis-cli PING` inside the
 * `hippo-graph` container (graphiti shares the same FalkorDB instance,
 * different graph name). Failure surfaces a single notify() but does
 * not block tool registration.
 *
 * Override docker binary, container name, redis port, or graph name
 * via environment variables:
 *
 *   LEGION_GRAPHITI_DOCKER_BIN     default: docker
 *   LEGION_GRAPHITI_CONTAINER      default: hippo-graph
 *   LEGION_GRAPHITI_REDIS_PORT     default: 6379
 *   LEGION_GRAPHITI_GRAPH          default: graphiti
 */
import { spawn } from "node:child_process";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function dockerBin(): string {
	return process.env.LEGION_GRAPHITI_DOCKER_BIN ?? "docker";
}

function container(): string {
	return process.env.LEGION_GRAPHITI_CONTAINER ?? "hippo-graph";
}

function redisPort(): string {
	return process.env.LEGION_GRAPHITI_REDIS_PORT ?? "6379";
}

function graphName(): string {
	return process.env.LEGION_GRAPHITI_GRAPH ?? "graphiti";
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
			resolve({ ok: false, stdout, stderr, error: `timed out after ${timeoutMs}ms` });
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
	name: "graphiti_recall",
	label: "Graphiti Recall",
	description:
		"Substring recall over the bi-temporal graphiti knowledge graph, optionally filtered to facts valid at a given ISO 8601 timestamp.",
	parameters: Type.Object({
		query: Type.String({ description: "Substring to search entity names for" }),
		point_in_time: Type.Optional(
			Type.String({
				description:
					"Optional ISO 8601 timestamp; if provided, restrict to facts whose valid_at <= t < invalid_at",
			}),
		),
		limit: Type.Optional(Type.Number({ description: "Max rows (default 50)" })),
	}),
	async execute(_id, params) {
		const escaped = params.query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const limit = Math.max(1, Math.min(params.limit ?? 50, 500));
		const pit = params.point_in_time?.trim();
		let cy: string;
		if (pit) {
			const escapedPit = pit.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			cy =
				`MATCH (e) WHERE toLower(e.name) CONTAINS toLower("${escaped}") ` +
				`OPTIONAL MATCH (e)-[r]-(n) ` +
				`WHERE (r.valid_at IS NULL OR r.valid_at <= "${escapedPit}") ` +
				`AND (r.invalid_at IS NULL OR r.invalid_at > "${escapedPit}") ` +
				`RETURN e.name AS root, type(r) AS rel, n.name AS target, r.valid_at AS valid_at, r.invalid_at AS invalid_at LIMIT ${limit}`;
		} else {
			cy =
				`MATCH (e) WHERE toLower(e.name) CONTAINS toLower("${escaped}") ` +
				`OPTIONAL MATCH (e)-[r]-(n) ` +
				`RETURN e.name AS root, type(r) AS rel, n.name AS target LIMIT ${limit}`;
		}
		const r = await cypher(cy);
		if (!r.ok) {
			const msg = r.error ?? r.stderr.trim() ?? `exit ${r.code}`;
			return {
				content: [{ type: "text", text: `graphiti_recall failed: ${msg}` }],
				details: { ok: false, error: msg, cypher: cy },
			};
		}
		return {
			content: [{ type: "text", text: r.stdout.trim() || "(no rows)" }],
			details: { ok: true, cypher: cy },
		};
	},
});

const graphitiTissue: ExtensionFactory = async (pi) => {
	pi.on("session_start", async (_event, ctx) => {
		const probe = await liveness();
		if (!probe.ok) {
			ctx.ui.notify(
				`legion: tissue 'graphiti' offline (${container()} unreachable: ${probe.detail})`,
				"warning",
			);
		}
	});

	pi.registerTool(recallTool);
};

export default graphitiTissue;
