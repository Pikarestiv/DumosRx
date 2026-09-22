import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "after-used",
          "argsIgnorePattern": "^_",
          "caughtErrors": "all",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      "max-lines": [
        "warn",
        {
          "max": 350,
          "skipBlankLines": true,
          "skipComments": true
        }
      ],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "eqeqeq": ["warn", "smart"]
    }
  },
  // Regression guard for the "bearer token persisted on dumosrx.com" fix.
  // web/ has no unit-test runner, so this is the enforced check: dumosrx.com
  // is a public marketing site that loads third-party JS, and since its own
  // dashboard was removed nothing on this origin makes an authenticated
  // non-admin request. Writing an api.dumosrx.com bearer token into this
  // origin's storage therefore only creates a live, never-expiring credential
  // for an XSS foothold to read. Admin auth stays in memory
  // (lib/store/use-admin-auth-store.ts) and is unaffected. The one permitted
  // mention is base-client.ts's one-time eviction of legacy stored tokens.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/api/base-client.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value='drx_token']",
          message:
            "Do not store or read a bearer token in dumosrx.com's localStorage. Nothing on this origin makes authenticated non-admin requests; admin auth is in-memory (use-admin-auth-store.ts). See the comment in lib/api/base-client.ts.",
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
