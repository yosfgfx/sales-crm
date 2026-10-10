import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: { baseURL: ORIGIN, locale: "ar-SA", timezoneId: "Asia/Riyadh", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node e2e/seed.cjs && npx next start -p ${PORT}`,
    url: `${ORIGIN}/api/session`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "postgres://postgres:wasl-e2e-local@localhost:54329/wasl_e2e",
      WASL_DB_SSL: "disable",
      SUPABASE_URL: "",
      SUPABASE_DB_PASSWORD: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      MEDIA_DATA_DIR: path.join(__dirname, ".e2e-data"),
      MEDIA_APP_ORIGIN: ORIGIN,
      WASL_REQUIRE_ADMIN_MFA: "false",
      WASL_EMAIL_ENABLED: "false",
      WASL_SESSION_SECRET: "e2e-session-secret-".padEnd(64, "x"),
      WASL_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
      GOOGLE_OAUTH_CLIENT_ID: "",
      GOOGLE_OAUTH_CLIENT_SECRET: "",
      CRON_SECRET: "",
    },
  },
});
