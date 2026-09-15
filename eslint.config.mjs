import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";
import globals from "globals";

export default defineConfig([
  globalIgnores([".next*/**", "next-env.d.ts", "playwright-report/**", "test-results/**", ".local/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "@next/next": next },
    rules: { ...hooks.configs.recommended.rules, ...next.configs.recommended.rules, ...next.configs["core-web-vitals"].rules },
  },
]);
