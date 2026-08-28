import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      include: [
        "src/app/routes.tsx",
        "src/lib/bookingMeta.ts",
        "src/lib/map-data.ts",
        "src/lib/ml/prophetEngine.ts",
        "src/lib/payments.ts",
        "src/lib/tracking/geo.ts",
        "src/lib/tracking/gpsFilter.ts",
        "src/lib/tracking/sessionAuthorization.ts",
        "src/lib/monitoring/systemHealthEngine.ts",
      ],
      thresholds: {
        lines: 45,
        functions: 40,
        branches: 35,
        statements: 45,
      },
      exclude: ["src/integrations/supabase/types.ts", "src/components/ui/**"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
