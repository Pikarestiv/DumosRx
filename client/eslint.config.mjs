import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

// eslint-config-next@16.x exports flat-config arrays directly (matching
// web/eslint.config.mjs) - no FlatCompat bridge needed as of the Next 16 bump.
const eslintConfig = [
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
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      "@next/next/no-img-element": "off",
      "react/no-unused-prop-types": "warn",
      "react/no-unused-state": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // New React Compiler rules in eslint-config-next@16 - see docs/FIXED_BUGS.md.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
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
    // Playwright's `use` fixture param is misread as React's use() hook.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
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
