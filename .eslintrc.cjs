module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  parserOptions: {
    es2022: true,
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  overrides: [
    {
      files: ["**/*.{ts}"],
    },
  ],
};
