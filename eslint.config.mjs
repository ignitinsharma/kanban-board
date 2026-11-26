import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const prismaPackages = {
  regex: "^(?:@prisma/|prisma(?:/|$))|(?:^|/)prisma/generated(?:/|$)",
  message: "Prisma packages and generated code belong in the database adapter.",
};
const prismaSingleton = {
  regex: "(?:^|/)(?:server/)?db/prisma(?:[./]|$)",
  message: "Import the Prisma singleton from repositories only.",
};
const serverImports = {
  regex: "^(?:@/|(?:\\.\\.?/)+|(?:\\.\\.?/)*src/)server(?:/|$)",
  message: "Client layers can use contracts from src/shared and HTTP APIs.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(["prisma/generated/**", "coverage/**"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/db/prisma.ts", "src/server/repositories/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [prismaPackages, prismaSingleton] },
      ],
    },
  },
  {
    files: ["src/server/repositories/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [prismaPackages] }],
    },
  },
  {
    files: ["src/{components,features,shared,lib}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [prismaPackages, prismaSingleton, serverImports] },
      ],
    },
  },
]);
