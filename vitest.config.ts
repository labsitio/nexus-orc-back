import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", ["allure-vitest/reporter", { resultsDir: "allure-results" }]],
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
