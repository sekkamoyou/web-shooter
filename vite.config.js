import { defineConfig } from "vite";

const repoName = "web-shooter";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : "/"
});
