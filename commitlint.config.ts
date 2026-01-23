import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ReleaseRule {
	type: string;
	release: string;
}

interface PackageJson {
	release?: {
		plugins?: ([string, { releaseRules?: ReleaseRule[] }] | string)[];
	};
}

// Read package.json to extract release types
const pkgPath = resolve(__dirname, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;

// Extract types from commit-analyzer releaseRules
const commitAnalyzerPlugin = pkg.release?.plugins?.find(
	(plugin): plugin is [string, { releaseRules?: ReleaseRule[] }] =>
		Array.isArray(plugin) && plugin[0] === "@semantic-release/commit-analyzer",
);

const releaseRules = commitAnalyzerPlugin?.[1]?.releaseRules;
const types = releaseRules?.map((rule: ReleaseRule) => rule.type) ?? [
	"feat",
	"fix",
	"docs",
	"style",
	"refactor",
	"perf",
	"test",
	"build",
	"ci",
	"chore",
	"revert",
];

export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"type-enum": [2, "always", types],
		"subject-case": [2, "always", "lower-case"],
		"header-max-length": [2, "always", 100],
	},
};
