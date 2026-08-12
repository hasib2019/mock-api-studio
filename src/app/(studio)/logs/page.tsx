import type { Metadata } from "next";

import LogsView from "@/components/LogsView";
import { listLogs } from "@/lib/logs";
import { listProjects } from "@/lib/store";

export const metadata: Metadata = {
  title: "Request logs · Mock API Studio",
};

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const [projects, logs] = await Promise.all([listProjects(), listLogs({ limit: 200 })]);

  return <LogsView projects={projects} initialLogs={logs} />;
}
