import { createDatabase } from "@genesis/database";
import type { GaotHealthPort } from "@genesis/mycelium-contracts";
import { createMyceliumApi } from "./http.js";
import { PostgresGaotReadPort } from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
const bearerToken = process.env.MYCELIUM_API_TOKEN;
const port = Number(process.env.MYCELIUM_API_PORT ?? "3200");

if (!databaseUrl) throw new Error("DATABASE_URL is required for Mycelium API startup.");
if (!bearerToken || bearerToken.length < 32) throw new Error("MYCELIUM_API_TOKEN must be at least 32 characters.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MYCELIUM_API_PORT must be a valid TCP port.");

const db = createDatabase(databaseUrl);
const healthPort: GaotHealthPort = {
  async inspect() {
    try {
      await db.selectFrom("org.organisations").select("id").limit(1).execute();
      return { status: "live", observedAt: new Date().toISOString(), version: "0.1.0" };
    } catch {
      return { status: "offline", observedAt: new Date().toISOString(), version: "0.1.0" };
    }
  },
};

const server = createMyceliumApi({ readPort: new PostgresGaotReadPort(db), healthPort, bearerToken });
server.listen(port, "127.0.0.1", () => console.log(`Mycelium API listening on 127.0.0.1:${port}`));

const shutdown = async (): Promise<void> => {
  server.close();
  await db.destroy();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
