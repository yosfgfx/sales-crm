import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3300;
const ORIGIN = `http://localhost:${PORT}`;
const local = Object.fromEntries(readFileSync(path.join(__dirname, ".env.local"), "utf8").split("\n").map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())).filter((match): match is RegExpExecArray => Boolean(match)).map((match) => [match[1], match[2].trim().replace(/^(["'])(.*)\1$/, "$2")]));
const DATABASE_URL = "postgres://postgres:wasl-e2e-local@localhost:54329/wasl_e2e";

export default defineConfig({
  testDir: "e2e-live",
  workers: 1,
  timeout: 480_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report-live" }]],
  outputDir: "e2e-results-live",
  use: { baseURL: ORIGIN, locale: "ar-SA", timezoneId: "Asia/Riyadh", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `node e2e/seed.cjs && node e2e-live/link-drive.cjs && npx next start -p ${PORT}`,
    url: `${ORIGIN}/api/session`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      WASL_DB_SSL: "disable",
      SUPABASE_URL: "",
      SUPABASE_DB_PASSWORD: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      MEDIA_DATA_DIR: path.join(__dirname, ".e2e-data"),
      MEDIA_APP_ORIGIN: ORIGIN,
      WASL_REQUIRE_ADMIN_MFA: "false",
      WASL_EMAIL_ENABLED: "false",
      WASL_SESSION_SECRET: "e2e-live-session-secret-".padEnd(64, "x"),
      WASL_ENCRYPTION_KEY: local.WASL_ENCRYPTION_KEY,
      GOOGLE_OAUTH_CLIENT_ID: local.GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: local.GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_PICKER_API_KEY: local.GOOGLE_PICKER_API_KEY,
      GOOGLE_CLOUD_PROJECT_NUMBER: local.GOOGLE_CLOUD_PROJECT_NUMBER,
      CRON_SECRET: "",
    },
  },
});
