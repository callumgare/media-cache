import type { QueryVariation } from "@@/server/database/schema";

export function calculateExpandedVariationCount(
  variations: QueryVariation[] | null | undefined,
): number {
  if (!variations || variations.length === 0) return 1;
  return variations.reduce((sum, variation) => {
    const entries = Object.values(variation.fieldOverrides).filter(
      (values) => values.length > 0,
    );
    const cartesianSize = entries.reduce(
      (product, values) => product * values.length,
      1,
    );
    return sum + cartesianSize;
  }, 0);
}

export function calculateExpectedPages(
  task: QueryExecutionTask,
  options: {
    previousPageCount?: number | null;
    fetchCountLimit: number | null;
    limitPerQueryVariation: boolean | null;
    queryVariations: QueryVariation[] | null;
  },
): { number: number; formattedNumber: string } {
  const prev = options.previousPageCount ?? -1;
  const expandedVariationCount = calculateExpandedVariationCount(
    options.queryVariations,
  );
  const limit =
    options.fetchCountLimit !== null
      ? options.fetchCountLimit *
        (options.limitPerQueryVariation ? expandedVariationCount : 1)
      : null;
  const formattedLimit = limit !== null ? `max ${limit}` : "";
  if (prev > 0 && task.pageCount <= prev * 1.5) {
    return {
      number: prev,
      formattedNumber: `~${prev}${formattedLimit ? ` (${formattedLimit})` : ""}`,
    };
  }
  const normalisedLimit = typeof limit === "number" && limit > 0 ? limit : 0;
  return {
    number: normalisedLimit,
    formattedNumber: formattedLimit || "unknown",
  };
}

export function calculateProcessedInAddOrUpdate(
  task: QueryExecutionTask,
): number {
  const { liaseMediaNew, liaseMediaUpdated, liaseMediaUnchanged } = task;
  return (
    (liaseMediaNew !== -1 ? liaseMediaNew : 0) +
    (liaseMediaUpdated !== -1 ? liaseMediaUpdated : 0) +
    (liaseMediaUnchanged !== -1 ? liaseMediaUnchanged : 0)
  );
}

export function calculateStageProgress(
  task: QueryExecutionTask,
  expectedPageCount = 0,
): { percent: number; mode: "determinate" | "indeterminate" } {
  const stage = task.stage;

  if (stage === "fetching-liase-results") {
    if (expectedPageCount > 0) {
      return {
        percent: Math.min(
          55,
          Math.round((task.pageCount / expectedPageCount) * 55),
        ),
        mode: "determinate",
      };
    }
    return { percent: 0, mode: "indeterminate" };
  }

  if (stage === "processing-added-or-updated") {
    const total = task.liaseMediaFound;
    if (total > 0) {
      return {
        percent: Math.min(
          90,
          Math.round(55 + (calculateProcessedInAddOrUpdate(task) / total) * 35),
        ),
        mode: "determinate",
      };
    }
    return { percent: 55, mode: "determinate" };
  }

  if (stage === "processing-removed") {
    return { percent: 90, mode: "determinate" };
  }

  if (stage === "removing-previous-execution-results") {
    return { percent: 95, mode: "determinate" };
  }

  return { percent: 0, mode: "indeterminate" };
}

export function formatProgressLabel(
  task: QueryExecutionTask,
  expectedPages: { number: number; formattedNumber: string },
): string {
  const stage = task.stage;

  if (stage === "fetching-liase-results") {
    if (expectedPages.number > 0) {
      return `Indexing page ${task.pageCount} of ${expectedPages.formattedNumber}`;
    }
    return `Running\u2026 (${task.pageCount} page${task.pageCount === 1 ? "" : "s"})`;
  }

  if (stage === "processing-added-or-updated") {
    const processed = calculateProcessedInAddOrUpdate(task);
    const total = task.liaseMediaFound !== -1 ? task.liaseMediaFound : "?";
    return `Processing ${processed} new or updated of ${total}`;
  }

  if (stage === "processing-removed") {
    return "Processing removed media\u2026";
  }

  if (stage === "removing-previous-execution-results") {
    return "Removing previous execution results\u2026";
  }

  return `Stage: ${formatStage(task)}`;
}

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
  if (execution.stage === "initialising") return "Initializing";
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
