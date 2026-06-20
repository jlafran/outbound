import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...new FlatCompat({
    baseDirectory: import.meta.dirname,
  }).extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([".next/**", "coverage/**", "drizzle/**", "next-env.d.ts"]),
]);
