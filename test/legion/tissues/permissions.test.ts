import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import permissionsTissue from "../../../extensions/legion/permissions.js";

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

describe("permissions tissue", () => {
	it("registers permissions_check", async () => {
		const api = fakeApi();
		await permissionsTissue(api as any);
		const names = api._registered.map((t: any) => t.name);
		expect(names).toContain("permissions_check");
	});

	it("permissions_check schema requires path", async () => {
		const api = fakeApi();
		await permissionsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "permissions_check");
		const schema = tool.parameters as any;
		expect(Object.keys(schema.properties)).toContain("path");
		expect(schema.required ?? []).toEqual(expect.arrayContaining(["path"]));
	});

	it("classifies allowlisted paths as allow", async () => {
		const api = fakeApi();
		await permissionsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "permissions_check");
		const r1 = await tool.execute("p1", { path: join(homedir(), ".claude/local/foo") });
		expect(r1.details.verdict).toBe("allow");
		const r2 = await tool.execute("p2", {
			path: join(homedir(), ".claude/plugins/local/legion-plugins/plugins/x"),
		});
		expect(r2.details.verdict).toBe("allow");
		const r3 = await tool.execute("p3", { path: join(homedir(), "Workspace/legion-pi") });
		expect(r3.details.verdict).toBe("allow");
		const r4 = await tool.execute("p4", { path: "/tmp/anything" });
		expect(r4.details.verdict).toBe("allow");
	});

	it("classifies denylisted paths as deny (overriding allowlist)", async () => {
		const api = fakeApi();
		await permissionsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "permissions_check");
		const r1 = await tool.execute("d1", {
			path: join(homedir(), ".claude/projects/-home-shawn/memory/foo.md"),
		});
		expect(r1.details.verdict).toBe("deny");
		const r2 = await tool.execute("d2", { path: join(homedir(), "CLAUDE.md") });
		expect(r2.details.verdict).toBe("deny");
		const r3 = await tool.execute("d3", { path: join(homedir(), ".claude/settings.json") });
		expect(r3.details.verdict).toBe("deny");
	});

	it("classifies unknown paths as ask", async () => {
		const api = fakeApi();
		await permissionsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "permissions_check");
		const r1 = await tool.execute("a1", { path: "/etc/passwd" });
		expect(r1.details.verdict).toBe("ask");
		const r2 = await tool.execute("a2", { path: "/var/log/syslog" });
		expect(r2.details.verdict).toBe("ask");
	});

	it("returns the verdict in content[0].text", async () => {
		const api = fakeApi();
		await permissionsTissue(api as any);
		const tool = api._registered.find((t: any) => t.name === "permissions_check");
		const r = await tool.execute("c1", { path: join(homedir(), ".claude/local/x") });
		expect(r.content[0].text).toBe("allow");
	});
});
