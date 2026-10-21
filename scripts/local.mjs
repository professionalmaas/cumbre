// One command for a local Cumbre demo.
// Installs the web packages and the Python analyzer, writes web/.env.local if
// it is missing, starts Postgres, applies the schema, then starts the app.
//
//   node scripts/local.mjs
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const web = join(root, "web");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const python = process.env.DEV_PYTHON || (process.platform === "win32" ? "python" : "python3");

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    // npm is a .cmd shim on Windows. Spawn it through cmd so Node does not
    // split "C:\Program Files\nodejs\node.exe" when shell is on for every command.
    const child =
      process.platform === "win32" && cmd === npm
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [cmd, ...args].join(" ")], {
            cwd,
            stdio: "inherit",
          })
        : spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

function probe(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "ignore" });
  return result.status === 0;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

if (!probe(python, ["--version"])) {
  console.error("Python 3.10+ is required and was not found. Install it, then run this again.");
  process.exit(1);
}
if (!probe("docker", ["version"])) {
  console.error("Docker is required and was not found. Start Docker Desktop, then run this again.");
  process.exit(1);
}

console.log("Installing web dependencies...");
await run(npm, ["install"], web);

console.log("Checking the Python analyzer...");
if (!probe(python, ["-c", "import librosa, numpy, sklearn, soundfile"])) {
  console.log("Installing the Python analyzer (librosa and the rest of worker/requirements.txt)...");
  await run(python, ["-m", "pip", "install", "-r", "worker/requirements.txt"], root);
} else {
  console.log("Python analyzer dependencies are already installed.");
}

const envFile = join(web, ".env.local");
if (!existsSync(envFile)) {
  copyFileSync(join(root, ".env.dev.example"), envFile);
  console.log("Wrote web/.env.local from .env.dev.example.");
}

console.log("Starting the local database...");
await run("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "-d"], root);
await run(process.execPath, ["dev/init-db.mjs"], root);

if (await portOpen(3000)) {
  console.log("Cumbre is already running at http://localhost:3000");
  console.log("Sign in with Continue as dev user.");
  process.exit(0);
}

console.log("Starting the app at http://localhost:3000");
await run(npm, ["run", "dev"], web);
