import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const OUT = "/tmp/legion-chromosome-test";
const REPO_ROOT = process.cwd();

function readMaybeJson(path: string): any | null {
	if (!existsSync(path)) return null;
	const raw = readFileSync(path, "utf8").trim();
	if (!raw) return null;
	// Output may include leading prose/whitespace before the JSON object.
	// Try to parse the whole file first; fall back to extracting the first
	// balanced JSON object.
	try {
		return JSON.parse(raw);
	} catch {
		// fall through
	}
	const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch) {
		try {
			return JSON.parse(fenceMatch[1].trim());
		} catch {
			// fall through
		}
	}
	const braceMatch = raw.match(/\{[\s\S]*\}/);
	if (braceMatch) {
		try {
			return JSON.parse(braceMatch[0]);
		} catch {
			return null;
		}
	}
	return null;
}

const expectedProviders = ["telus-gpt-oss", "telus-gemma", "telus-qwen"];
const requiredKeys = ["model", "identity_first_line", "channel_confirmed", "tissues_named", "next_action"];

describe("chromosome portability — three-LLM cross-check", () => {
	beforeAll(() => {
		const r = spawnSync("bash", ["scripts/chromosome-test.sh"], {
			cwd: REPO_ROOT,
			stdio: "inherit",
		});
		if (r.error) console.error("driver script error:", r.error);
	}, 600_000);

	it("each provider produced a captured output file", () => {
		for (const p of expectedProviders) {
			expect(existsSync(join(OUT, `${p}.json`))).toBe(true);
		}
	});

	it("at least 75% of (provider, key) pairs are present and parseable", () => {
		const failures: string[] = [];
		const total = expectedProviders.length * requiredKeys.length;

		for (const p of expectedProviders) {
			const data = readMaybeJson(join(OUT, `${p}.json`));
			if (!data || typeof data !== "object") {
				for (const k of requiredKeys) failures.push(`${p}: no parseable JSON (missing '${k}')`);
				continue;
			}
			for (const k of requiredKeys) {
				if (!(k in data)) failures.push(`${p}: missing key '${k}'`);
			}
		}

		const passed = total - failures.length;
		const rate = passed / total;
		// Always log the raw outcome for transparency in CI logs.
		console.log(`[portability] ${passed}/${total} (${(rate * 100).toFixed(1)}%) pairs matched`);
		for (const f of failures) console.log(`[portability]   FAIL ${f}`);

		expect(rate).toBeGreaterThanOrEqual(0.75);
	});
});
