// Apply db/001 -> 002 -> 003 to the local Docker Postgres. Uses docker exec, so
// it works on Windows without bash or a local psql. Idempotent.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const container = process.env.CUMBRE_DB_CONTAINER || "cumbre-dev-db";
const dbUser = process.env.CUMBRE_DB_USER || "cumbre";
const dbName = process.env.CUMBRE_DB_NAME || "cumbre";
const files = ["001_schema.sql", "002_subscriptions.sql", "003_feedback.sql"];

function spawnDocker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: [input ? "pipe" : "ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`docker exited ${code}`));
    });
    if (input) child.stdin.end(input);
  });
}

let listed;
try {
  listed = await spawnDocker(["ps", "--format", "{{.Names}}"]);
} catch {
  console.error("error: docker is not available.");
  console.error("       start it with:  docker compose -f docker-compose.dev.yml up -d");
  process.exit(1);
}
if (!listed.split(/\r?\n/).includes(container)) {
  console.error(`error: container '${container}' is not running.`);
  console.error("       start it with:  docker compose -f docker-compose.dev.yml up -d");
  process.exit(1);
}

process.stdout.write("waiting for postgres to be ready...\n");
let up = false;
for (let i = 0; i < 30; i++) {
  try {
    await spawnDocker(["exec", container, "pg_isready", "-U", dbUser, "-d", dbName]);
    up = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!up) {
  console.error("error: postgres did not become ready.");
  process.exit(1);
}

for (const file of files) {
  process.stdout.write(`applying db/${file} ...\n`);
  const sql = readFileSync(join(root, "db", file));
  await spawnDocker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName], sql);
}

process.stdout.write("schema applied. DATABASE_URL=postgres://cumbre:cumbre@localhost:55432/cumbre\n");
