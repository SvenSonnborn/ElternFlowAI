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
      // Generated file — re-created by MCP after schema migrations, do not lint
      "features/supabase/database.types.ts",
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
    files: ["**/*.{ts,tsx}"],
    ignores: ["app-sections/shared/confirmDialog.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Alert",
          property: "alert",
          message:
            "Alert.alert ist auf react-native-web ein No-op. confirmDestructive / showAlert aus @/app-sections/shared benutzen.",
        },
      ],
    },
  },

  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='accessibilityState']",
          message:
            "accessibilityState kommt auf Web nicht im DOM an — aria-checked/aria-selected/aria-expanded bzw. die disabled-Prop nehmen (ADR-054).",
        },
        {
          selector: "JSXAttribute[name.name='hitSlop']",
          message:
            "hitSlop wirkt auf Web nicht und wird nativ am Elternteil beschnitten — Pressable mit touchTarget.min als Box (ADR-041).",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Pressable'] > JSXAttribute[name.name='accessibilityRole'] > Literal[value=/^(radio|checkbox|switch)$/]",
          message:
            "Pressable nimmt auf Web die Leertaste nur bei Rolle button an — für radio/checkbox/switch SelectionPressable aus @/app-sections/shared nehmen (ADR-054).",
        },
      ],
    },
  },

  {
    files: ["__tests__/**", "**/*.{test,spec}.{ts,tsx,js,jsx}", "**/*.jest.{ts,tsx}", "testing/**"],
    rules: {
      "i18next/no-literal-string": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },

  prettierConfig,
];
