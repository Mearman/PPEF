import eslint from "@eslint/js";
import markdown from "@eslint/markdown";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import jsonc from "eslint-plugin-jsonc";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

export default [
	// Ignore patterns
	{
		ignores: ["dist/**", "coverage/**", "node_modules/**"],
	},

	// Base JavaScript/TypeScript rules (scoped to JS/TS files only)
	{
		files: ["**/*.{js,ts,tsx}"],
		...eslint.configs.recommended,
	},

	// TypeScript files - base language options (parserOptions.project for type-aware rules)
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			globals: {
				process: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["commitlint.config.ts", "eslint.config.ts"],
					tsconfigRootDir: import.meta.dirname,
				},
			},
		},
	},

	// TypeScript files - strict type-checked rules
	...tseslint.configs.strictTypeChecked.map((config) => ({
		...config,
		files: ["**/*.ts", "**/*.tsx"],
	})),

	// TypeScript files - stylistic type-checked rules
	...tseslint.configs.stylisticTypeChecked.map((config) => ({
		...config,
		files: ["**/*.ts", "**/*.tsx"],
	})),

	// TypeScript files - custom rule overrides
	{
		files: ["**/*.ts", "**/*.tsx"],
		plugins: {
			"eslint-comments": eslintComments,
		},
		rules: {
			indent: ["error", "tab"],
			quotes: ["error", "double", { avoidEscape: true }],
			"@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
			"eslint-comments/no-use": ["error", { allow: [] }],
		},
	},

	// Markdown files
	...markdown.configs.recommended,

	// JSON/JSONC files
	...jsonc.configs["flat/recommended-with-json"],
	...jsonc.configs["flat/prettier"],

	// Prettier integration (must be last to override conflicting rules)
	prettierRecommended,
	{
		files: ["**/*.{ts,js,json,md}"],
		plugins: {
			prettier: prettierPlugin,
		},
		rules: {
			"prettier/prettier": [
				"error",
				{
					useTabs: true,
					tabWidth: 2,
					singleQuote: false,
					trailingComma: "all",
					printWidth: 100,
				},
			],
		},
	},

	// Test files - relax strict rules
	{
		files: ["**/*.test.ts", "**/*.spec.ts"],
		plugins: {
			"eslint-comments": eslintComments,
		},
		rules: {
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-empty-function": "off",
			"eslint-comments/no-use": "off",
		},
	},

	// CLI validation files - allow eslint-disable for user input validation
	{
		files: ["src/cli/**/*.ts"],
		rules: {
			"eslint-comments/no-use": "off",
			"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
		},
	},
];
