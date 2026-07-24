import { defineConfig } from "vite";

const repoName = "web-shooter";
const basePath =
  process.env.BASE_PATH ??
  (process.env.GITHUB_ACTIONS ? `/${repoName}/` : "/");

export default defineConfig({
  base: basePath
});
