import { resolve } from "node:path";
import { createCommunityServer } from "./app.mjs";

const port = Number(process.env.PORT ?? 4174);
const server = createCommunityServer({ dbPath: resolve(process.env.NIWA_DB ?? "data/community.sqlite") });
server.listen(port, process.env.HOST ?? "127.0.0.1", () => console.log(`NIWA server: http://localhost:${port}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
