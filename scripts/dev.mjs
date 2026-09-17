import { spawn } from "node:child_process";
import { createServer } from "node:net";

async function available(start) {
  for (let port = start; port < start + 20; port += 1) {
    const free = await new Promise((resolve) => {
      const socket = createServer();
      socket.once("error", () => resolve(false));
      socket.listen(port, "127.0.0.1", () => socket.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("No available development port");
}
const apiPort = await available(4174);
const api = spawn(process.execPath, ["server/index.mjs"], { stdio: "inherit", env: { ...process.env, PORT: String(apiPort) } });
const ui = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "4173", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, NIWA_API_TARGET: `http://127.0.0.1:${apiPort}` },
});
let closing = false;
const close = () => { if (closing) return; closing = true; api.kill(); ui.kill(); };
api.on("exit", close);
ui.on("exit", close);
process.on("SIGINT", close);
process.on("SIGTERM", close);
