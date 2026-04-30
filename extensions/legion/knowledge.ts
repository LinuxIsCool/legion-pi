/**
 * Legion knowledge tissue.
 *
 * Wraps the claude-knowledge MCP server (`uv run --directory <plugin-root>
 * scripts/mcp_server.py`) over stdio, using the JSON-RPC 2.0 framing the
 * MCP spec defines. Each `execute()` call:
 *
 *   1. Spawns the child process.
 *   2. Sends `initialize` and `notifications/initialized`.
 *   3. Sends `tools/call` with the requested tool name and arguments.
 *   4. Reads stdout line-by-line, parses each as JSON.
 *   5. Returns the matching response, then closes the child.
 *
 * This is the canonical "MCP over stdio" template re-used by P4 tissues.
 *
 * Override the spawn command via env:
 *   LEGION_KNOWLEDGE_MCP_CMD   full command line (space-separated)
 * Default: `uv run --directory <claude-knowledge-plugin-root> scripts/mcp_server.py`
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

const DEFAULT_PLUGIN_ROOT = join(
	homedir(),
	".claude/plugins/local/legion-plugins/plugins/claude-knowledge",
);

function mcpCommand(): { cmd: string; args: string[] } {
	const override = process.env.LEGION_KNOWLEDGE_MCP_CMD;
	if (override) {
		const parts = override.split(/\s+/).filter(Boolean);
		return { cmd: parts[0] ?? "false", args: parts.slice(1) };
	}
	const root = process.env.LEGION_KNOWLEDGE_PLUGIN_ROOT ?? DEFAULT_PLUGIN_ROOT;
	return {
		cmd: "uv",
		args: ["run", "--directory", root, "scripts/mcp_server.py"],
	};
}

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: number | string;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id?: number | string | null;
	result?: any;
	error?: { code: number; message: string; data?: unknown };
}

/**
 * Spawn the MCP server, run a single tools/call, return the result.
 *
 * Returns `{ ok: true, result }` on success, `{ ok: false, error }` on any
 * failure. Never throws.
 */
async function callMcpTool(
	toolName: string,
	args: Record<string, unknown>,
	timeoutMs = 60_000,
): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
	const { cmd, args: cmdArgs } = mcpCommand();

	return await new Promise((resolve) => {
		let child;
		try {
			child = spawn(cmd, cmdArgs, {
				stdio: ["pipe", "pipe", "pipe"],
				env: process.env,
			});
		} catch (e) {
			resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
			return;
		}

		let stdoutBuf = "";
		let stderrBuf = "";
		let resolved = false;
		let nextId = 1;

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
				error: `MCP call timed out after ${timeoutMs}ms (stderr: ${stderrBuf.slice(-500)})`,
			});
		}, timeoutMs);

		const send = (req: JsonRpcRequest) => {
			child.stdin?.write(`${JSON.stringify(req)}\n`);
		};

		const initId = nextId++;
		const callId = nextId++;

		const handleResponse = (resp: JsonRpcResponse) => {
			if (resp.id === initId) {
				// initialization complete - send initialized notification, then call
				send({ jsonrpc: "2.0", method: "notifications/initialized" });
				send({
					jsonrpc: "2.0",
					id: callId,
					method: "tools/call",
					params: { name: toolName, arguments: args },
				});
				return;
			}
			if (resp.id === callId) {
				if (resolved) return;
				resolved = true;
				clearTimeout(timer);
				try {
					child.stdin?.end();
				} catch {
					// ignore
				}
				if (resp.error) {
					resolve({ ok: false, error: `MCP error: ${resp.error.message}` });
				} else {
					resolve({ ok: true, result: resp.result });
				}
				try {
					child.kill();
				} catch {
					// ignore
				}
			}
		};

		child.stdout?.on("data", (chunk: Buffer) => {
			stdoutBuf += chunk.toString("utf8");
			let idx = stdoutBuf.indexOf("\n");
			while (idx >= 0) {
				const line = stdoutBuf.slice(0, idx).trim();
				stdoutBuf = stdoutBuf.slice(idx + 1);
				if (line) {
					try {
						const parsed = JSON.parse(line) as JsonRpcResponse;
						handleResponse(parsed);
					} catch {
						// non-JSON line; ignore
					}
				}
				idx = stdoutBuf.indexOf("\n");
			}
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			stderrBuf += chunk.toString("utf8");
		});

		child.on("error", (e) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			resolve({ ok: false, error: `spawn failed: ${e.message}` });
		});

		child.on("close", (code) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			resolve({
				ok: false,
				error: `MCP server exited with code ${code} before responding (stderr: ${stderrBuf.slice(-500)})`,
			});
		});

		// Kick off the handshake.
		send({
			jsonrpc: "2.0",
			id: initId,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "legion-pi-knowledge-tissue", version: "0.1.0" },
			},
		});
	});
}

function extractText(result: any): string {
	if (!result) return "";
	const content = result.content;
	if (!Array.isArray(content)) return JSON.stringify(result);
	const parts: string[] = [];
	for (const item of content) {
		if (item && typeof item === "object" && item.type === "text" && typeof item.text === "string") {
			parts.push(item.text);
		}
	}
	return parts.join("\n");
}

const recallTool = defineTool({
	name: "knowledge_recall",
	label: "Knowledge Recall",
	description: "Cross-backend knowledge search with RRF merge.",
	parameters: Type.Object({
		query: Type.String({ description: "Natural language search query" }),
		scope: Type.Optional(Type.String({ description: "Optional namespace/persona scope filter" })),
		knowledge_type: Type.Optional(
			Type.String({ description: "Optional type filter: semantic, episodic, procedural, working" }),
		),
		limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { query: params.query };
		if (params.scope !== undefined) args.scope = params.scope;
		if (params.knowledge_type !== undefined) args.knowledge_type = params.knowledge_type;
		if (params.limit !== undefined) args.limit = params.limit;
		const r = await callMcpTool("knowledge_recall", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `knowledge_recall error: ${r.error}` }],
				details: { ok: false, error: r.error },
			};
		}
		const text = extractText(r.result) || "(empty result)";
		return {
			content: [{ type: "text", text }],
			details: { ok: true, raw: r.result },
		};
	},
});

const storeTool = defineTool({
	name: "knowledge_store",
	label: "Knowledge Store",
	description: "Store a piece of knowledge across writable backends.",
	parameters: Type.Object({
		content: Type.String({ description: "Knowledge content to store" }),
		knowledge_type: Type.Optional(
			Type.String({ description: "Type (default: semantic)" }),
		),
		scope: Type.Optional(Type.String({ description: "Optional scope" })),
		metadata: Type.Optional(Type.String({ description: "Optional JSON metadata string" })),
	}),
	async execute(_id, params) {
		const args: Record<string, unknown> = { content: params.content };
		if (params.knowledge_type !== undefined) args.knowledge_type = params.knowledge_type;
		if (params.scope !== undefined) args.scope = params.scope;
		if (params.metadata !== undefined) args.metadata = params.metadata;
		const r = await callMcpTool("knowledge_store", args);
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `knowledge_store error: ${r.error}` }],
				details: { ok: false, error: r.error },
			};
		}
		const text = extractText(r.result) || "(empty result)";
		return {
			content: [{ type: "text", text }],
			details: { ok: true, raw: r.result },
		};
	},
});

const healthTool = defineTool({
	name: "knowledge_health",
	label: "Knowledge Health",
	description: "Check the health of all knowledge backends.",
	parameters: Type.Object({}),
	async execute() {
		const r = await callMcpTool("knowledge_health", {});
		if (!r.ok) {
			return {
				content: [{ type: "text", text: `knowledge_health error: ${r.error}` }],
				details: { ok: false, error: r.error },
			};
		}
		const text = extractText(r.result) || "(empty result)";
		return {
			content: [{ type: "text", text }],
			details: { ok: true, raw: r.result },
		};
	},
});

const knowledgeTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(recallTool);
	pi.registerTool(storeTool);
	pi.registerTool(healthTool);
};

export default knowledgeTissue;
