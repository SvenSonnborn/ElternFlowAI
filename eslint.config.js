const expoConfig = require("eslint-config-expo/flat");
const tseslint = require("typescript-eslint");
const prettierConfig = require("eslint-config-prettier");
const unusedImports = require("eslint-plugin-unused-imports");
const perfectionist = require("eslint-plugin-perfectionist");
const i18next = require("eslint-plugin-i18next");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "web-build/**",
      "android/**",
      "ios/**",
      "coverage/**",
      "**/*.config.js",
      "expo-env.d.ts",
      "nativewind-env.d.ts",
      // HANDOFF bundle — designer-owned, off-limits (see CLAUDE.md)
      "design-system/colors.ts",
      "design-system/typography.ts",
      "design-system/spacing.ts",
      "design-system/themes.ts",
      "design-system/components.ts",
      "design-system/index.ts",
    ],
  },

  ...expoConfig,

  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ["**/*.{ts,tsx}"],
  })),

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },

  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "unused-imports": unusedImports,
      perfectionist,
      i18next,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      "perfectionist/sort-imports": [
        "warn",
        {
          type: "natural",
          order: "asc",
          internalPattern: ["^@/.+"],
        },
      ],

      "i18next/no-literal-string": "warn",

      "react-hooks/exhaustive-deps": "error",
    },
  },

  {
    files: ["__tests__/**", "**/*.{test,spec}.{ts,tsx,js,jsx}"],
    rules: {
      "i18next/no-literal-string": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },

  prettierConfig,
];
