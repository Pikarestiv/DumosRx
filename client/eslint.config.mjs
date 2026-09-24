import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import unusedImports from "eslint-plugin-unused-imports";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next@15.x's exports are still legacy (eslintrc-shaped, not
// a flat-config array) - unlike web/'s newer eslint-config-next@16.x,
// which exports flat-config arrays directly (see web/eslint.config.mjs).
// FlatCompat bridges the two: `next/core-web-vitals`/`next/typescript` here
// are resolved via this package's own `require.resolve`, same as the
// standard Next.js ESLint-9 migration path.
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      "@next/next/no-img-element": "off",
      "react/no-unused-prop-types": "warn",
      "react/no-unused-state": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "eqeqeq": ["warn", "smart"],
      "max-lines": [
        "warn",
        {
          "max": 350,
          "skipBlankLines": true,
          "skipComments": true
        }
      ]
    }
  },
  {
    files: ["lib/db/queries/**/*.ts"],
    rules: {
      "max-lines": [
        "warn",
        {
          "max": 600,
          "skipBlankLines": true,
          "skipComments": true
        }
      ]
    }
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
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src-tauri/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
