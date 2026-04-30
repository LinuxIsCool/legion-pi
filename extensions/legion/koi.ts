/**
 * Legion KOI tissue.
 *
 * Three tools backed by the personal-koi HTTP API (default port 8351):
 *
 *   koi_recall       GET /search?q=...&limit=...&source=...
 *   koi_store        POST /ingest
 *   koi_namespaces   GET /entity-types
 *
 * Liveness check at session_start hits GET /health and surfaces a single
 * notify() if the service is unreachable. The tools themselves never throw;
 * they return content with a clear error message and a structured details
 * object so the agent can reason about the failure.
 */
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function koiBase(): string {
	return process.env.KOI_BASE_URL ?? "http://localhost:8351";
}

async function liveness(base: string): Promise<{ ok: boolean; status?: number; error?: string }> {
	try {
		const r = await fetch(`${base}/health`, { method: "GET" });
		return { ok: r.ok, status: r.status };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

const recallTool = defineTool({
	name: "koi_recall",
	label: "KOI Recall",
	description: "Search the KOI knowledge base by free-text query. Returns ranked entity matches.",
	parameters: Type.Object({
		query: Type.String({ description: "Free-text search query" }),
		limit: Type.Optional(Type.Number({ description: "Maximum results (default 10)" })),
		source: Type.Optional(Type.String({ description: "Optional source filter" })),
	}),
	async execute(_id, params) {
		const url = new URL(`${koiBase()}/search`);
		url.searchParams.set("q", params.query);
		url.searchParams.set("limit", String(params.limit ?? 10));
		if (params.source) url.searchParams.set("source", params.source);
		try {
			const r = await fetch(url, { method: "GET" });
			const text = await r.text();
			let data: unknown = text;
			try {
				data = JSON.parse(text);
			} catch {
				// keep raw text
			}
			if (!r.ok) {
				return {
					content: [{ type: "text", text: `koi_recall failed (${r.status}): ${text}` }],
					details: { ok: false, status: r.status, body: data },
				};
			}
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
				details: { ok: true, status: r.status, body: data },
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `koi_recall network error: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
	},
});

const storeTool = defineTool({
	name: "koi_store",
	label: "KOI Store",
	description: "Ingest an extraction into the KOI knowledge base.",
	parameters: Type.Object({
		content: Type.String({ description: "Source text to extract entities/relations from" }),
		source: Type.Optional(Type.String({ description: "Source identifier (URL, file path, etc.)" })),
		metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	}),
	async execute(_id, params) {
		try {
			const r = await fetch(`${koiBase()}/ingest`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: params.content,
					source: params.source,
					metadata: params.metadata ?? {},
				}),
			});
			const text = await r.text();
			let data: unknown = text;
			try {
				data = JSON.parse(text);
			} catch {
				// keep raw text
			}
			if (!r.ok) {
				return {
					content: [{ type: "text", text: `koi_store failed (${r.status}): ${text}` }],
					details: { ok: false, status: r.status, body: data },
				};
			}
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
				details: { ok: true, status: r.status, body: data },
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `koi_store network error: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
	},
});

const namespacesTool = defineTool({
	name: "koi_namespaces",
	label: "KOI Namespaces",
	description: "List entity-type configurations in the KOI knowledge base.",
	parameters: Type.Object({}),
	async execute() {
		try {
			const r = await fetch(`${koiBase()}/entity-types`, { method: "GET" });
			const text = await r.text();
			let data: unknown = text;
			try {
				data = JSON.parse(text);
			} catch {
				// keep raw text
			}
			if (!r.ok) {
				return {
					content: [{ type: "text", text: `koi_namespaces failed (${r.status}): ${text}` }],
					details: { ok: false, status: r.status, body: data },
				};
			}
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
				details: { ok: true, status: r.status, body: data },
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `koi_namespaces network error: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
	},
});

const koiTissue: ExtensionFactory = async (pi) => {
	pi.on("session_start", async (_event, ctx) => {
		const probe = await liveness(koiBase());
		if (!probe.ok) {
			const detail = probe.error ?? `HTTP ${probe.status}`;
			ctx.ui.notify(`legion: tissue 'koi' offline (${koiBase()} unreachable: ${detail})`, "warning");
		}
	});

	pi.registerTool(recallTool);
	pi.registerTool(storeTool);
	pi.registerTool(namespacesTool);
};

export default koiTissue;
