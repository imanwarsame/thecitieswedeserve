// eslint-disable-next-line no-undef
module.exports = {
env: { browser: true, es2020: true },
extends: [
  "eslint:recommended",
  "plugin:@typescript-eslint/recommended",
  "plugin:react-hooks/recommended",
],
parser: "@typescript-eslint/parser",
parserOptions: { ecmaVersion: "latest", sourceType: "module" },
plugins: ["react-refresh"],
rules: {
  "react-refresh/only-export-components": "warn",
  semi: ["error", "always"],
  indent: ["error", "tab"],
  "linebreak-style": ["error", "windows"],
  quotes: ["error", "single"],
  eqeqeq: "error",
  "no-trailing-spaces": "error",
  "object-curly-spacing": ["error", "always"],
  "arrow-spacing": ["error", { before: true, after: true }],
},
};
