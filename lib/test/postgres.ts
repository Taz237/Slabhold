import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

function postgresBin(name: string) {
  const root = "/usr/lib/postgresql";
  if (existsSync(root)) {
    for (const version of readdirSync(root).sort().reverse()) {
      const path = join(root, version, "bin", name);
      if (existsSync(path)) return path;
    }
  }
  return name;
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not reserve a port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function must(bin: string, args: string[], label: string) {
  const result = spawnSync(bin, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

/** A throwaway local Postgres cluster. Call stop() in after(). */
export async function startPostgres(prefix: string) {
  const pgCtl = postgresBin("pg_ctl");
  const psql = postgresBin("psql");
  const root = mkdtempSync(join(tmpdir(), prefix));
  const dataDir = join(root, "data");
  const port = await freePort();
  let started = false;
  const stop = () => {
    if (started) spawnSync(pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
    rmSync(root, { recursive: true, force: true });
  };
  try {
    must(postgresBin("initdb"), ["-D", dataDir, "--auth=trust", "--no-sync", "--username", userInfo().username], "initdb");
    must(
      pgCtl,
      ["-D", dataDir, "-l", join(root, "server.log"), "-w", "start", "-o", `-p ${port} -k ${root} -c listen_addresses=`],
      "pg_ctl start",
    );
    started = true;
  } catch (error) {
    stop();
    throw error;
  }
  const args = ["-h", root, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f"];
  let count = 0;
  return {
    runFile(path: string, label: string) {
      return must(psql, [...args, path], label);
    },
    run(sql: string, label: string) {
      count += 1;
      const path = join(root, `step-${count}.sql`);
      writeFileSync(path, sql);
      return must(psql, [...args, path], label);
    },
    stop,
  };
}
