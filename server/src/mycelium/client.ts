/**
 * HTTP transport for canonical Mycelium read projections.
 *
 * This adapter deliberately exposes no mutation method. Named, governed
 * commands are added only once their canonical Mycelium application services
 * exist; donor repositories must never become a fallback write path.
 */
export interface MyceliumHealthProjection {
  status: "live" | "degraded" | "offline";
  observedAt: string;
  version?: string;
}

export interface MyceliumCompanyProjection {
  canonicalId: string;
  canonicalVersion: number;
  sourceHash: string;
  observedAt: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED";
}

export type MyceliumCollectionProjection = ReadonlyArray<Record<string, unknown>>;

export class MyceliumApiError extends Error {
  public constructor(public readonly status: number, public readonly code: string) {
    super(`Mycelium API request failed: ${status} ${code}`);
  }
}

export interface HttpMyceliumReadClientOptions {
  baseUrl: string;
  bearerToken: string;
  fetchImplementation?: typeof fetch;
}

export class HttpMyceliumReadClient {
  private readonly baseUrl: URL;
  private readonly fetchImplementation: typeof fetch;

  public constructor(private readonly options: HttpMyceliumReadClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    const local = this.baseUrl.hostname === "127.0.0.1" || this.baseUrl.hostname === "localhost" || this.baseUrl.hostname === "::1";
    if (this.baseUrl.protocol !== "https:" && !local) throw new Error("Mycelium API must use HTTPS outside loopback.");
    if (options.bearerToken.length < 32) throw new Error("Mycelium API bearer token must be at least 32 characters.");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public inspect(): Promise<MyceliumHealthProjection> {
    return this.getObject("v1/health", isHealthProjection);
  }

  public getCompany(companyId: string): Promise<MyceliumCompanyProjection> {
    return this.getObject(`v1/companies/${encodeURIComponent(companyId)}`, isCompanyProjection);
  }

  public listWorkers(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "workers"); }
  public listGoals(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "goals"); }
  public listWorkUnits(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "work-units"); }
  public listRuns(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "runs"); }
  public listActivity(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "activity"); }
  public listCosts(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "costs"); }
  public listEvidence(companyId: string): Promise<MyceliumCollectionProjection> { return this.getCollection(companyId, "evidence"); }

  private async getCollection(companyId: string, resource: string): Promise<MyceliumCollectionProjection> {
    return this.getObject(`v1/companies/${encodeURIComponent(companyId)}/${resource}`, isCollectionProjection);
  }

  private async getObject<T>(path: string, guard: (value: unknown) => value is T): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImplementation(new URL(path, this.baseUrl), { headers: { authorization: `Bearer ${this.options.bearerToken}`, accept: "application/json" } });
    } catch {
      // A stopped/unreachable canonical service has no HTTP response. Normalize
      // connection failures so projection routes can serve their binding-scoped
      // last-known value and health can report `offline` consistently.
      throw new MyceliumApiError(503, "canonical_state_unavailable");
    }
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = isRecord(body) && typeof body.error === "string" ? body.error : "unknown_error";
      throw new MyceliumApiError(response.status, code);
    }
    if (!guard(body)) throw new MyceliumApiError(502, "invalid_canonical_projection");
    return body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isCollectionProjection(value: unknown): value is MyceliumCollectionProjection { return Array.isArray(value) && value.every(isRecord); }
function isHealthProjection(value: unknown): value is MyceliumHealthProjection { return isRecord(value) && (value.status === "live" || value.status === "degraded" || value.status === "offline") && typeof value.observedAt === "string" && (value.version === undefined || typeof value.version === "string"); }
function isCompanyProjection(value: unknown): value is MyceliumCompanyProjection { return isRecord(value) && typeof value.canonicalId === "string" && typeof value.canonicalVersion === "number" && typeof value.sourceHash === "string" && typeof value.observedAt === "string" && typeof value.name === "string" && (value.status === "ACTIVE" || value.status === "PAUSED" || value.status === "SUSPENDED" || value.status === "ARCHIVED"); }
