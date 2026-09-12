import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BadgeCheck, Bot, FileCheck2, Network, ShieldCheck, Target } from "lucide-react";
import { myceliumApi, type MyceliumActivityProjection, type MyceliumEvidenceProjection, type MyceliumGoalProjection, type MyceliumRunProjection, type MyceliumWorkUnitProjection, type MyceliumWorkerProjection } from "../api/mycelium";
import { EmptyState } from "../components/EmptyState";
import { InlineBanner } from "../components/InlineBanner";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Row = MyceliumWorkerProjection | MyceliumGoalProjection | MyceliumWorkUnitProjection | MyceliumRunProjection | MyceliumActivityProjection | MyceliumEvidenceProjection;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ACCEPTED" || status === "ACTIVE" || status === "AVAILABLE" || status === "SUCCEEDED") return "default";
  if (status === "BLOCKED" || status === "ESCALATED" || status === "FAILED" || status === "ERROR") return "destructive";
  if (status === "RUNNING" || status === "WORKING" || status === "AWAITING_REVIEW") return "secondary";
  return "outline";
}

function titleFor(row: Row): string {
  if ("displayName" in row) return row.displayName;
  if ("title" in row) return row.title;
  if ("summary" in row) return row.summary;
  if ("kind" in row) return row.kind;
  return row.canonicalId;
}

function detailFor(row: Row): string | null {
  if ("description" in row && row.description) return row.description;
  if ("type" in row) return row.type;
  if ("workerId" in row) return `Worker ${row.workerId}`;
  if ("uri" in row) return row.uri;
  if ("controlPlane" in row) return row.controlPlane;
  return null;
}

function observedFor(row: Row): string {
  return "occurredAt" in row ? row.occurredAt : row.observedAt;
}

function ProjectionList({ title, description, rows, icon: Icon }: { title: string; description: string; rows: Row[]; icon: typeof Bot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No canonical records currently projected.</p>
        ) : (
          <ul className="space-y-3">
            {rows.slice(0, 8).map((row) => (
              <li key={row.canonicalId} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{titleFor(row)}</p>
                  {detailFor(row) ? <p className="mt-1 truncate text-xs text-muted-foreground">{detailFor(row)}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">Observed {timeAgo(observedFor(row))}</p>
                </div>
                {"status" in row ? <Badge variant={statusVariant(row.status)}>{row.status}</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MyceliumControlPlane() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Mycelium" }]); }, [setBreadcrumbs]);

  const enabled = Boolean(selectedCompanyId);
  const health = useQuery({ queryKey: queryKeys.mycelium.health, queryFn: myceliumApi.health, enabled });
  const company = useQuery({ queryKey: queryKeys.mycelium.company(selectedCompanyId ?? ""), queryFn: () => myceliumApi.company(selectedCompanyId!), enabled });
  const workers = useQuery({ queryKey: queryKeys.mycelium.workers(selectedCompanyId ?? ""), queryFn: () => myceliumApi.workers(selectedCompanyId!), enabled });
  const goals = useQuery({ queryKey: queryKeys.mycelium.goals(selectedCompanyId ?? ""), queryFn: () => myceliumApi.goals(selectedCompanyId!), enabled });
  const workUnits = useQuery({ queryKey: queryKeys.mycelium.workUnits(selectedCompanyId ?? ""), queryFn: () => myceliumApi.workUnits(selectedCompanyId!), enabled });
  const runs = useQuery({ queryKey: queryKeys.mycelium.runs(selectedCompanyId ?? ""), queryFn: () => myceliumApi.runs(selectedCompanyId!), enabled });
  const activity = useQuery({ queryKey: queryKeys.mycelium.activity(selectedCompanyId ?? ""), queryFn: () => myceliumApi.activity(selectedCompanyId!), enabled });
  const evidence = useQuery({ queryKey: queryKeys.mycelium.evidence(selectedCompanyId ?? ""), queryFn: () => myceliumApi.evidence(selectedCompanyId!), enabled });
  const costs = useQuery({ queryKey: queryKeys.mycelium.costs(selectedCompanyId ?? ""), queryFn: () => myceliumApi.costs(selectedCompanyId!), enabled });

  if (!selectedCompanyId) return <EmptyState icon={Network} message="Select an organization to inspect its canonical Mycelium projection." />;
  if (company.isLoading) return <PageSkeleton variant="dashboard" />;
  if (company.error) {
    return <InlineBanner tone="warning" title="Canonical projection unavailable">{company.error.message}. GAOT will not substitute Paperclip records for canonical Mycelium state.</InlineBanner>;
  }
  if (!company.data) return null;

  const errors = [workers, goals, workUnits, runs, activity, evidence, costs].filter((query) => query.error).length;
  const totalCost = (costs.data ?? []).reduce((total, cost) => total + cost.amountMinor, 0);
  const costCurrency = costs.data?.[0]?.currency ?? "";
  return (
    <div className="space-y-6">
      <InlineBanner tone={health.data?.status === "live" ? "info" : "warning"} title="Canonical Mycelium projection">
        Read-only view of {company.data.name}. GAOT presentation state cannot approve, dispatch, or alter canonical work.
      </InlineBanner>
      {errors > 0 ? <InlineBanner tone="warning" title="Some projections are unavailable">{errors} canonical read model{errors === 1 ? " is" : "s are"} unavailable. No donor fallback is shown.</InlineBanner> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Canonical status</CardDescription><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{company.data.status}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Work units</CardDescription><CardTitle>{workUnits.data?.length ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Evidence records</CardDescription><CardTitle>{evidence.data?.length ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Cost projection</CardDescription><CardTitle>{costCurrency ? `${costCurrency} ${totalCost}` : "Unavailable"}</CardTitle></CardHeader></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ProjectionList title="Workers" description="Certified Mycelium workers and their current availability." rows={workers.data ?? []} icon={Bot} />
        <ProjectionList title="Goals" description="Canonical goals; GAOT cannot create or edit them here." rows={goals.data ?? []} icon={Target} />
        <ProjectionList title="Work units" description="Explicitly assigned canonical work. Done means Guardian-accepted only." rows={workUnits.data ?? []} icon={BadgeCheck} />
        <ProjectionList title="Runs" description="Execution lifecycle, distinct from Guardian acceptance." rows={runs.data ?? []} icon={Activity} />
        <ProjectionList title="Evidence" description="Immutable evidence attached to canonical work." rows={evidence.data ?? []} icon={FileCheck2} />
        <ProjectionList title="Activity" description="Canonical control-plane events." rows={activity.data ?? []} icon={Activity} />
      </div>
    </div>
  );
}
