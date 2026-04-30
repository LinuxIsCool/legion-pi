/**
 * Legion voice tissue — TTS only (STT lands in P5).
 *
 * One tool:
 *
 *   voice_speak(text, persona)   POST {text, persona} to the claude-voice
 *                                TTS HTTP endpoint.
 *
 * Liveness check at session_start hits a HEAD/GET on the configured URL
 * and surfaces a single notify() if the daemon is unreachable.
 *
 * Override the endpoint via env:
 *
 *   LEGION_VOICE_URL    default: http://localhost:7780/speak
 *
 * The plan calls for HTTP POST. The current claude-voice daemon also
 * supports a Unix-socket transport for in-process callers, but for
 * legion-pi (which may run on other machines via Tailscale) HTTP is
 * the portable choice. If the local daemon is socket-only, set
 * LEGION_VOICE_URL to a thin HTTP shim or unset it (the tissue will
 * notify offline once at session start and the tool will return
 * structured errors on call rather than throw).
 */
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function voiceUrl(): string {
	return process.env.LEGION_VOICE_URL ?? "http://localhost:7780/speak";
}

async function probe(url: string): Promise<{ ok: boolean; detail: string }> {
	try {
		// HEAD first; some servers don't support it, so fall back to GET on 405.
		let r = await fetch(url, { method: "HEAD" });
		if (r.status === 405) r = await fetch(url, { method: "GET" });
		return { ok: r.status < 500, detail: `HTTP ${r.status}` };
	} catch (e) {
		return { ok: false, detail: e instanceof Error ? e.message : String(e) };
	}
}

const speakTool = defineTool({
	name: "voice_speak",
	label: "Voice Speak",
	description: "Synthesize and play TTS for a piece of text in the named persona's voice.",
	parameters: Type.Object({
		text: Type.String({ description: "Text to speak" }),
		persona: Type.String({ description: "Persona slug whose voice should speak (e.g. matt)" }),
	}),
	async execute(_id, params) {
		const url = voiceUrl();
		try {
			const r = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: params.text, persona: params.persona }),
			});
			const text = await r.text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {
				// keep raw text
			}
			if (!r.ok) {
				return {
					content: [{ type: "text", text: `voice_speak failed (${r.status}): ${text}` }],
					details: { ok: false, status: r.status, body },
				};
			}
			return {
				content: [{ type: "text", text: `voice: queued for ${params.persona}` }],
				details: { ok: true, status: r.status, body },
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return {
				content: [{ type: "text", text: `voice_speak network error: ${msg}` }],
				details: { ok: false, error: msg },
			};
		}
	},
});

const voiceTissue: ExtensionFactory = async (pi) => {
	pi.on("session_start", async (_event, ctx) => {
		const r = await probe(voiceUrl());
		if (!r.ok) {
			ctx.ui.notify(
				`legion: tissue 'voice' offline (${voiceUrl()} unreachable: ${r.detail})`,
				"warning",
			);
		}
	});

	pi.registerTool(speakTool);
};

export default voiceTissue;
