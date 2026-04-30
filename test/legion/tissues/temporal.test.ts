import { describe, expect, it, vi } from "vitest";
import temporalTissue from "../../../extensions/legion/temporal.js";

function fakeApi() {
	const registered: any[] = [];
	const handlers = new Map<string, (event: any, ctx: any) => any>();
	return {
		registerTool: vi.fn((tool: any) => {
			registered.push(tool);
		}),
		on: vi.fn((event: string, handler: any) => {
			handlers.set(event, handler);
		}),
		ui: { notify: vi.fn() },
		_registered: registered,
		_handlers: handlers,
	};
}

describe("temporal tissue", () => {
	it("registers temporal_now and temporal_relative", async () => {
		const api = fakeApi();
		await temporalTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("temporal_now");
		expect(names).toContain("temporal_relative");
	});

	it("temporal_now returns ISO + weekday + month + day_of_year", async () => {
		const api = fakeApi();
		await temporalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "temporal_now");
		const r = await tool.execute("n1", {});
		expect(r.details.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
		expect(typeof r.details.weekday).toBe("string");
		expect(r.details.weekday.length).toBeGreaterThan(0);
		expect(typeof r.details.month).toBe("string");
		expect(r.details.month.length).toBeGreaterThan(0);
		expect(typeof r.details.day_of_year).toBe("number");
		expect(r.details.day_of_year).toBeGreaterThanOrEqual(1);
		expect(r.details.day_of_year).toBeLessThanOrEqual(366);
	});

	it("temporal_relative parses 'today', 'yesterday', 'tomorrow'", async () => {
		const api = fakeApi();
		await temporalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "temporal_relative");
		const today = await tool.execute("r1", { phrase: "today" });
		const yest = await tool.execute("r2", { phrase: "yesterday" });
		const tom = await tool.execute("r3", { phrase: "tomorrow" });
		expect(today.details.iso).toBeDefined();
		expect(yest.details.iso).toBeDefined();
		expect(tom.details.iso).toBeDefined();
		const todayDate = new Date(today.details.iso);
		const yestDate = new Date(yest.details.iso);
		const tomDate = new Date(tom.details.iso);
		expect(yestDate.getTime()).toBeLessThan(todayDate.getTime());
		expect(tomDate.getTime()).toBeGreaterThan(todayDate.getTime());
	});

	it("temporal_relative parses 'N days/weeks/months ago'", async () => {
		const api = fakeApi();
		await temporalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "temporal_relative");
		const r1 = await tool.execute("r4", { phrase: "3 days ago" });
		const r2 = await tool.execute("r5", { phrase: "2 weeks ago" });
		const r3 = await tool.execute("r6", { phrase: "1 month ago" });
		const today = new Date();
		const d1 = new Date(r1.details.iso);
		const d2 = new Date(r2.details.iso);
		const d3 = new Date(r3.details.iso);
		const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
		expect(dayDiff(d1, today)).toBeGreaterThanOrEqual(2);
		expect(dayDiff(d1, today)).toBeLessThanOrEqual(4);
		expect(dayDiff(d2, today)).toBeGreaterThanOrEqual(13);
		expect(dayDiff(d2, today)).toBeLessThanOrEqual(15);
		expect(dayDiff(d3, today)).toBeGreaterThanOrEqual(28);
		expect(dayDiff(d3, today)).toBeLessThanOrEqual(32);
	});

	it("temporal_relative reports unparseable phrases", async () => {
		const api = fakeApi();
		await temporalTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "temporal_relative");
		const r = await tool.execute("r7", { phrase: "the sun-day after the next blue moon" });
		expect(r.content[0].text.toLowerCase()).toContain("unparseable");
	});
});
