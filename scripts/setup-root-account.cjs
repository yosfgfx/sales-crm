/* eslint-disable @typescript-eslint/no-require-imports -- Offline bootstrap uses the project's TypeScript transpiler. */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const project = path.resolve(__dirname, "..");
const ts = require(path.join(project, "node_modules/typescript"));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) { return resolve.call(this, name.startsWith("@/") ? path.join(project, name.slice(2)) : name, parent, ...args); };
require.extensions[".ts"] = function (mod, filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  mod._compile(code, filename);
};
const envFile = path.join(project, ".env.local");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
process.chdir(project);
const nameArgument = process.argv.indexOf("--name");
const name = nameArgument >= 0 ? process.argv[nameArgument + 1] : undefined;
if (process.stdin.isTTY) {
  console.error("Supply the root password through stdin. No password is accepted as a command argument.");
  process.exitCode = 1;
} else {
  const password = fs.readFileSync(0, "utf8").replace(/\r?\n$/, "");
  require(path.join(project, "lib/media-server.ts")).provisionRootAccount(password, name)
    .then(result => console.log(JSON.stringify({ success: true, ...result })))
    .catch(error => { console.error(error && error.code ? `Root setup failed: ${error.code}` : "Root setup failed. Check server account configuration."); process.exitCode = 1; });
}
