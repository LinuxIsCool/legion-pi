/**
 * Legion temporal tissue.
 *
 * Pure-JS, no backing service. Two tools:
 *
 *   temporal_now()           current ISO 8601 timestamp + weekday/month/day_of_year
 *   temporal_relative(phrase) parse "today" / "yesterday" / "tomorrow" /
 *                            "N day(s)|week(s)|month(s) ago" → ISO date
 */
import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionFactory } from "@mariozechner/pi-coding-agent";

function dayOfYear(d: Date): number {
	const start = Date.UTC(d.getUTCFullYear(), 0, 0);
	const diff = d.getTime() - start;
	return Math.floor(diff / 86_400_000);
}

const nowTool = defineTool({
	name: "temporal_now",
	label: "Temporal Now",
	description: "Current ISO 8601 timestamp plus weekday, month name, and day-of-year.",
	parameters: Type.Object({}),
	async execute(_id, _params) {
		const now = new Date();
		const iso = now.toISOString();
		const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
		const month = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
		const doy = dayOfYear(now);
		return {
			content: [{ type: "text", text: iso }],
			details: { iso, weekday, month, day_of_year: doy },
		};
	},
});

const relativeTool = defineTool({
	name: "temporal_relative",
	label: "Temporal Relative",
	description:
		"Parse a relative date phrase (today, yesterday, tomorrow, 'N day/week/month(s) ago') to ISO date.",
	parameters: Type.Object({
		phrase: Type.String({ description: "Relative date phrase" }),
	}),
	async execute(_id, params) {
		const phrase = params.phrase.trim().toLowerCase();
		const now = new Date();
		const target = new Date(now);
		const m = phrase.match(/^(\d+)\s+(day|week|month)s?\s+ago$/i);

		if (phrase === "today") {
			// no-op
		} else if (phrase === "yesterday") {
			target.setUTCDate(now.getUTCDate() - 1);
		} else if (phrase === "tomorrow") {
			target.setUTCDate(now.getUTCDate() + 1);
		} else if (m) {
			const n = parseInt(m[1]!, 10);
			const unit = m[2]!.toLowerCase();
			if (unit === "day") target.setUTCDate(now.getUTCDate() - n);
			else if (unit === "week") target.setUTCDate(now.getUTCDate() - n * 7);
			else if (unit === "month") target.setUTCMonth(now.getUTCMonth() - n);
		} else {
			return {
				content: [{ type: "text", text: `unparseable: ${params.phrase}` }],
				details: { ok: false, error: `unparseable phrase: ${params.phrase}` },
			};
		}

		const iso = target.toISOString();
		return {
			content: [{ type: "text", text: iso.slice(0, 10) }],
			details: { ok: true, iso, date: iso.slice(0, 10) },
		};
	},
});

const temporalTissue: ExtensionFactory = async (pi) => {
	pi.registerTool(nowTool);
	pi.registerTool(relativeTool);
};

export default temporalTissue;
