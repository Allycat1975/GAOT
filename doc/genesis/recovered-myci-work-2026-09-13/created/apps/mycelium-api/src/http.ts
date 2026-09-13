import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { GaotCanonicalId, GaotHealthPort, GaotReadPort } from "@genesis/mycelium-contracts";

export interface MyceliumApiOptions {
  readPort: GaotReadPort;
  healthPort: GaotHealthPort;
  bearerToken: string;
}

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
};

const id = (value: string): GaotCanonicalId => value as GaotCanonicalId;

const matchesToken = (provided: string | undefined, expected: string): boolean => {
  if (!provided?.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(provided.slice(7));
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
};

function pathSegments(request: IncomingMessage): string[] {
  return new URL(request.url ?? "/", "http://mycelium.local").pathname.split("/").filter(Boolean);
}

/**
 * Read-only API. There are deliberately no generic PATCH/POST mutation routes:
 * canonical commands are added only with their governed application services.
 */
export function createMyceliumApi(options: MyceliumApiOptions): Server {
  return createServer(async (request, response) => {
    try {
      if (request.method !== "GET") return json(response, 405, { error: "method_not_allowed" });
      if (!matchesToken(request.headers.authorization, options.bearerToken)) return json(response, 401, { error: "unauthorized" });
      const segments = pathSegments(request);
      if (segments.length === 2 && segments[0] === "v1" && segments[1] === "health") return json(response, 200, await options.healthPort.inspect());
      if (segments.length < 3 || segments[0] !== "v1" || segments[1] !== "companies") return json(response, 404, { error: "not_found" });
      const companyId = id(segments[2] ?? "");
      if (segments.length === 3) {
        const company = await options.readPort.getCompany(companyId);
        return company ? json(response, 200, company) : json(response, 404, { error: "company_not_found" });
      }
      const resource = segments[3];
      if (resource === "workers") return json(response, 200, await options.readPort.listWorkers(companyId));
      if (resource === "goals") return json(response, 200, await options.readPort.listGoals(companyId));
      if (resource === "work-units") return json(response, 200, await options.readPort.listWorkUnits(companyId));
      if (resource === "runs") return json(response, 200, await options.readPort.listRuns(companyId));
      if (resource === "activity") return json(response, 200, await options.readPort.listActivity(companyId));
      if (resource === "costs") return json(response, 200, await options.readPort.listCosts(companyId));
      if (resource === "evidence") return json(response, 200, await options.readPort.listEvidence(companyId));
      return json(response, 404, { error: "not_found" });
    } catch (error) {
      console.error("Mycelium API request failed", error);
      return json(response, 503, { error: "canonical_state_unavailable" });
    }
  });
}
