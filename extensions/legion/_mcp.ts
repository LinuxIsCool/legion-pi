/**
 * Shared MCP-over-stdio helper for Legion tissues that wrap claude-* MCP
 * servers. Used by recordings, transcripts, prompts, messages, calendar.
 *
 * The helper mirrors the JSON-RPC 2.0 framing in extensions/legion/knowledge.ts
 * (the canonical template) but is exported so we don't redefine the same
 * 100-line state machine in every tissue.
 *
 * Each call:
 *
 *   1. Spawns the child process.
 *   2. Sends `initialize` and `notifications/initialized`.
 *   3. Sends `tools/call` with the requested tool name and arguments.
 *   4. Reads stdout line-by-line, parses each as JSON-RPC.
 *   5. Returns the matching response, then closes the child.
 *
 * Returns `{ ok: true, result }` or `{ ok: false, error }` — never throws.
 */
import { spawn } from "node:child_process";

export interface McpCommand {
	cmd: string;
	args: string[];
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
 * Resolve an MCP command from an env-var override. The override is a single
 * space-separated string (`"node /path/to/mcp.mjs"`); fall back to the
 * provided default. The override scheme mirrors `LEGION_KNOWLEDGE_MCP_CMD`.
 */
export function resolveMcpCommand(envVar: string, fallback: McpCommand): McpCommand {
	const override = process.env[envVar];
	if (!override) return fallback;
	const parts = override.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return fallback;
	return { cmd: parts[0]!, args: parts.slice(1) };
}

export async function callMcpTool(
	command: McpCommand,
	toolName: string,
	args: Record<string, unknown>,
	timeoutMs = 60_000,
): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
	return await new Promise((resolve) => {
		let child;
		try {
			child = spawn(command.cmd, command.args, {
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

		send({
			jsonrpc: "2.0",
			id: initId,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "legion-pi-tissue", version: "0.1.0" },
			},
		});
	});
}

export function extractMcpText(result: any): string {
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
