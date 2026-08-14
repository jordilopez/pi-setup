// ESLint flat config for the pi-setup extension/script code.
// Runtime deps are zero; this only needs `npm install` (devDependencies).
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      // Prose content loaded verbatim by pi — not linted.
      "skills/**",
      "prompts/**",
      "agents/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // validate.ts uses `any` in catch clauses on purpose (unknown shapes
      // from child-process stderr).
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
