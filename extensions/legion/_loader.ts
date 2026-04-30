/**
 * Legion tissue loader.
 *
 * Registers a `--legion <slug-list>` CLI flag. At session_start, parses the
 * value (comma-separated tissue slugs, or "all"), then dynamically imports
 * each tissue module from `./<slug>.ts` and invokes its default export with
 * the same ExtensionAPI handle.
 *
 * Tissues opt INTO the runtime — nothing loads unless --legion names it.
 * This is the d/acc surface-area discipline: only the tools the operator
 * asked for show up in the manifest.
 */
import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

const ALL_TISSUES = [
	"koi",
	"knowledge",
	"hippo",
	"graphiti",
	"journal",
	"scratchpad",
	"backlog",
	"voice",
	"recordings",
	"transcripts",
	"prompts",
	"messages",
	"calendar",
	"schedule",
	"ventures",
	"roadmaps",
	"inventory",
	"personas",
	"matrix",
	"outbox",
	"discourse",
	"dock",
	"factory",
	"temporal",
	"secrets",
	"permissions",
];

const legionLoader: ExtensionFactory = async (pi: ExtensionAPI) => {
	pi.registerFlag("legion", {
		description: "Comma-separated Legion tissues to load (or 'all').",
		type: "string",
		default: "",
	});

	pi.on("session_start", async (_event, ctx) => {
		const raw = pi.getFlag("legion");
		const flag = typeof raw === "string" ? raw.trim() : "";
		if (!flag) return;

		const requested =
			flag === "all"
				? [...ALL_TISSUES]
				: flag
						.split(",")
						.map((s: string) => s.trim())
						.filter(Boolean);

		for (const slug of requested) {
			if (!ALL_TISSUES.includes(slug)) {
				ctx.ui.notify(`legion: unknown tissue '${slug}' (skipped)`, "warning");
				continue;
			}
			try {
				const mod = await import(`./${slug}.js`);
				const factory: ExtensionFactory = mod.default;
				if (typeof factory !== "function") {
					ctx.ui.notify(`legion: tissue '${slug}' has no default export`, "warning");
					continue;
				}
				await factory(pi);
				ctx.ui.notify(`legion: tissue '${slug}' loaded`, "info");
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				ctx.ui.notify(`legion: tissue '${slug}' failed to load (${msg})`, "error");
			}
		}
	});
};

export default legionLoader;
