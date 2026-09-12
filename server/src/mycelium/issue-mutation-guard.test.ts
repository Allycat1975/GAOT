import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  companies,
  createDb,
  genesisProjectionBindings,
  issues,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "@paperclipai/db";
import { issueService } from "../services/issues.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("Mycelium issue projection mutation guard", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("rejects generic updates of bound issues but permits local issues", async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("gaot-mycelium-issue-guard-");
    const db = createDb(tempDb.connectionString);
    const companyId = randomUUID();
    const boundIssueId = randomUUID();
    const localIssueId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Genesis test company",
      issuePrefix: "GEN",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(issues).values([
      { id: boundIssueId, companyId, title: "Canonical work", status: "todo", priority: "medium" },
      { id: localIssueId, companyId, title: "Local work", status: "todo", priority: "medium" },
    ]);
    await db.insert(genesisProjectionBindings).values({
      companyId,
      canonicalSystem: "mycelium",
      canonicalId: "work-unit-1",
      projectionKind: "work_unit",
      localTargetKind: "issue",
      localTargetId: boundIssueId,
    });

    const service = issueService(db);
    await expect(service.update(boundIssueId, { title: "Attempted donor edit" })).rejects.toMatchObject({
      status: 409,
      details: { code: "mycelium_projection_mutation_forbidden" },
    });
    await expect(
      service.checkout(boundIssueId, randomUUID(), ["todo"], null),
    ).rejects.toMatchObject({
      status: 409,
      details: { code: "mycelium_projection_mutation_forbidden" },
    });
    await expect(service.update(localIssueId, { title: "Permitted local edit" })).resolves.toMatchObject({
      id: localIssueId,
      title: "Permitted local edit",
    });

    const [bound] = await db
      .select({ title: issues.title })
      .from(issues)
      .where(eq(issues.id, boundIssueId));
    expect(bound?.title).toBe("Canonical work");
  });
});
