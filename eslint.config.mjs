// Required ESLint baseline (ai-project-guide rules/typescript.md).
// Install: npm i -D eslint @eslint/js typescript-eslint
// Add a "lint": "eslint ." script, and run it in the pre-commit hook and CI.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/**", "**/build/**", "**/coverage/**", "project-documents/**", "packages/electron/**", "lib/**", "**/tests/**", "**/vitest.config.ts"] },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Exception handling (general.md): no swallowed errors.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-useless-catch": "error",
      "@typescript-eslint/only-throw-error": "error",
      // Async: every promise is awaited or explicitly handled.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Core runs inside the MCP stdio server, where stdout carries JSON-RPC.
    // Diagnostics go to stderr only (#113).
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
);
