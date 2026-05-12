export function formatStatus(execution: QueryExecutionTask | null): string {
  if (!execution) return "Never run";
  if (execution.status === "failed") return "Failed";
  if (execution.status === "running") return "Running…";
  if (execution.status === "completed") return "Completed";
  return execution.status satisfies never;
}
export function formatStage(
  execution: QueryExecutionTask | null | undefined,
): string {
  if (!execution || !execution.stage) return "-";
  if (execution.stage === "fetching-liase-results")
    return "Fetching liase results";
  if (execution.stage === "processing-added-or-updated")
    return "Processing added and updated media";
  if (execution.stage === "processing-removed")
    return "Processing removed media";
  if (execution.stage === "removing-previous-execution-results")
    return "Removing previous execution results";
  execution.stage satisfies never;
  if (execution.stage) return `unknown stage "${execution.stage}"`;
  return "-";
}
