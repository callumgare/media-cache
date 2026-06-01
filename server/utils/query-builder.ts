import type {
  QueryCondition,
  QueryFieldCondition,
} from "@@/types/query-condition";
import { type SQL, and, eq, or, sql } from "drizzle-orm";
import { dbSchema } from "./drizzle";

export type BuildContext = { userId: number | null };

export function removeField(
  condition: QueryCondition,
  field: string,
): QueryCondition {
  if (condition.type === "field") {
    return condition.field === field ? { ...condition, value: "" } : condition;
  }
  return {
    ...condition,
    conditions: condition.conditions.map((c) => removeField(c, field)),
  };
}

/**
 * Builds an optimal WHERE clause given how it will be used.
 *
 * `optimisationHint` describes the calling context so the function can pick the
 * right index strategy:
 *
 * - `"pdb.agg"` (default) — the clause will be used inside a `pdb.agg()` call.
 *   Emits BM25 `===` operators (+ a `@@@` anchor when needed) so ParadeDB can
 *   aggregate directly from the columnar index without touching the heap.
 *   Always returns a non-undefined SQL value.
 *
 * - `"select"` — the clause will be used in a plain `SELECT`/`COUNT` query.
 *   Emits standard GIN `@>` / boolean operators so PostgreSQL can use covering
 *   BTree indexes for parallel index-only scans. Returns `undefined` when no
 *   conditions are active (i.e. match-all — omit the WHERE clause entirely).
 */
export function calculateWhereValue(
  condition: QueryCondition,
  options: { optimisationHint: "pdb.agg"; userId?: number | null },
): SQL;
export function calculateWhereValue(
  condition: QueryCondition,
  options: { optimisationHint: "select"; userId?: number | null },
): SQL | undefined;
export function calculateWhereValue(condition: QueryCondition): SQL;
export function calculateWhereValue(
  condition: QueryCondition,
  options: { userId?: number | null },
): SQL;
export function calculateWhereValue(
  condition: QueryCondition,
  options: {
    optimisationHint?: "pdb.agg" | "select";
    userId?: number | null;
  } = {},
): SQL | undefined {
  const ctx: BuildContext = { userId: options.userId ?? null };
  if (options.optimisationHint === "select") {
    return _buildStandardWhere(condition, ctx) ?? undefined;
  }
  const { bm25Sql, regularSql } = _buildBM25Parts(condition, ctx);
  const anchor: SQL = bm25Sql ?? sql`${dbSchema.cacheMedia.id} @@@ pdb.all()`;
  if (regularSql) return and(anchor, regularSql) ?? anchor;
  return anchor;
}

/** Standard PostgreSQL WHERE clause (GIN `@>` / boolean operators, no BM25). */
function _buildStandardWhere(
  condition: QueryCondition,
  ctx: BuildContext = { userId: null },
): SQL | null {
  if (condition.type === "group") {
    const childConditions = condition.conditions.filter(
      (condition) => !("value" in condition) || condition.value !== "",
    );
    if (!childConditions.length) return null;
    const childSqls = childConditions
      .map((c) => _buildStandardWhere(c, ctx))
      .filter((s): s is SQL => s !== null);
    if (!childSqls.length) return null;
    if (condition.operator === "AND") return and(...childSqls) ?? null;
    if (condition.operator === "OR") return or(...childSqls) ?? null;
    throw Error(`Unknown operator: ${condition.operator}`);
  }

  const { field, value, operator } = condition;
  if (field === "source") {
    if (operator === "equals") {
      return sql`${dbSchema.cacheMedia.liaseSourceIds} @> ARRAY[${value}]::text[]`;
    }
    throw Error(`Unknown operator for source field: ${operator}`);
  }
  if (field === "tags" || field === "groups") {
    if (operator === "includes all") {
      if (!Array.isArray(value) || !value.length) return null;
      return sql`${dbSchema.cacheMedia.groupIds} @> ARRAY[${sql.join(
        value.map((id) => sql`${Number(id)}`),
        sql`, `,
      )}]::integer[]`;
    }
    throw Error(`Unknown operator for ${field} field: ${operator}`);
  }
  if (field === "type") {
    if (value === "video")
      return (
        and(
          eq(dbSchema.cacheMedia.hasVideo, true),
          eq(dbSchema.cacheMedia.hasImage, false),
        ) ?? null
      );
    if (value === "video-with-audio")
      return (
        and(
          eq(dbSchema.cacheMedia.hasVideo, true),
          eq(dbSchema.cacheMedia.hasImage, false),
          eq(dbSchema.cacheMedia.hasAudio, true),
        ) ?? null
      );
    if (value === "video-without-audio")
      return (
        and(
          eq(dbSchema.cacheMedia.hasVideo, true),
          eq(dbSchema.cacheMedia.hasImage, false),
          eq(dbSchema.cacheMedia.hasAudio, false),
        ) ?? null
      );
    if (value === "image")
      return (
        and(
          eq(dbSchema.cacheMedia.hasImage, true),
          eq(dbSchema.cacheMedia.hasVideo, false),
        ) ?? null
      );
    throw Error(`Unknown value for field "type": ${value}`);
  }

  if (field === "duration") {
    if (operator === "is between") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
      const { min, max } = value as {
        min?: number | null;
        max?: number | null;
      };
      if (min == null && max == null) return null;
      const clauses: SQL[] = [];
      if (min != null)
        clauses.push(sql`${dbSchema.cacheMedia.duration} >= ${min}`);
      if (max != null)
        clauses.push(sql`${dbSchema.cacheMedia.duration} <= ${max}`);
      return and(...clauses) ?? null;
    }
    throw Error(`Unknown operator for duration field: ${operator}`);
  }

  if (field === "favourited") {
    if (!value || value === "") return null;
    if (!ctx.userId) return null;
    if (operator === "equals") {
      const { userCacheMediaInfo } = dbSchema;
      const subquery = sql`SELECT 1 FROM ${userCacheMediaInfo} WHERE ${userCacheMediaInfo.cacheMediaId} = ${dbSchema.cacheMedia.id} AND ${userCacheMediaInfo.userId} = ${ctx.userId} AND ${userCacheMediaInfo.favourited} = true`;
      if (value === "yes") return sql`EXISTS (${subquery})`;
      if (value === "no") return sql`NOT EXISTS (${subquery})`;
    }
    return null;
  }

  throw Error(`Unknown field: ${field}`);
}

function _buildBM25Parts(
  condition: QueryCondition,
  ctx: BuildContext = { userId: null },
): {
  bm25Sql: SQL | null;
  regularSql: SQL | null;
} {
  if (condition.type === "group") {
    const activeChildren = condition.conditions.filter(
      (c) => !("value" in c) || c.value !== "",
    );
    if (!activeChildren.length) return { bm25Sql: null, regularSql: null };

    const childParts = activeChildren.map((c) => _buildBM25Parts(c, ctx));
    const bm25Children = childParts
      .map((p) => p.bm25Sql)
      .filter((s): s is SQL => s !== null);
    const regularChildren = childParts
      .map((p) => p.regularSql)
      .filter((s): s is SQL => s !== null);

    const combinator = condition.operator === "AND" ? and : or;

    // For OR groups with mixed BM25 and regular SQL children the conditions cannot be
    // recombined separately: OR requires all operands evaluated together.
    // Fall back to regular SQL for the entire subtree so the result is always correct.
    if (
      condition.operator === "OR" &&
      bm25Children.length > 0 &&
      regularChildren.length > 0
    ) {
      return { bm25Sql: null, regularSql: _buildStandardWhere(condition, ctx) };
    }

    return {
      bm25Sql:
        bm25Children.length > 0 ? (combinator(...bm25Children) ?? null) : null,
      regularSql:
        regularChildren.length > 0
          ? (combinator(...regularChildren) ?? null)
          : null,
    };
  }

  return _buildBM25FieldParts(condition, ctx);
}

function _buildBM25FieldParts(
  condition: QueryFieldCondition,
  ctx: BuildContext = { userId: null },
): {
  bm25Sql: SQL | null;
  regularSql: SQL | null;
} {
  const { field, value, operator } = condition;

  if (field === "source") {
    if (operator === "equals") {
      if (!value) return { bm25Sql: null, regularSql: null };
      return {
        bm25Sql: sql`${dbSchema.cacheMedia.liaseSourceIds} === ${value}`,
        regularSql: null,
      };
    }
  }

  if (field === "tags" || field === "groups") {
    if (operator === "includes all") {
      if (!Array.isArray(value) || !value.length)
        return { bm25Sql: null, regularSql: null };
      // group_ids is integer[] — ParadeDB's === operator requires a direct column
      // reference and does not support cast expressions. Use GIN (@>) instead.
      return { bm25Sql: null, regularSql: _buildStandardWhere(condition, ctx) };
    }
  }

  if (field === "type") {
    // Boolean columns aren't text — use regular SQL; the BM25 anchor handles the index path
    return { bm25Sql: null, regularSql: _buildStandardWhere(condition, ctx) };
  }

  if (field === "duration") {
    // Numeric range — use regular SQL with the existing duration index
    return { bm25Sql: null, regularSql: _buildStandardWhere(condition, ctx) };
  }

  if (field === "favourited") {
    // Server-side subquery — use regular SQL
    return { bm25Sql: null, regularSql: _buildStandardWhere(condition, ctx) };
  }

  return { bm25Sql: null, regularSql: null };
}
