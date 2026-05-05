import { sql, and, or, eq, type SQL } from 'drizzle-orm'
import { dbSchema } from './drizzle'
import type { QueryCondition, QueryFieldCondition } from '@@/types/query-condition'

export function removeField(condition: QueryCondition, field: string): QueryCondition {
  if (condition.type === 'field') {
    return condition.field === field ? { ...condition, value: '' } : condition
  }
  return { ...condition, conditions: condition.conditions.map(c => removeField(c, field)) }
}

/**
 * Builds a WHERE clause optimised for this database (ParadeDB / pg_search).
 *
 * - source/tags conditions use BM25 `===` operators so that `pdb.agg` can read
 *   directly from the columnar index — avoiding full heap scans.
 * - type conditions use regular SQL boolean comparisons (boolean columns are not
 *   in the BM25 index), combined with a BM25 anchor so the planner uses the index.
 * - OR groups that mix BM25 and regular-SQL children fall back entirely to
 *   standard SQL to preserve correct semantics.
 * - Empty / no-op conditions → `id @@@ pdb.all()` (match-all BM25 scan).
 *
 * The result is always valid SQL in ParadeDB and can be used in both `pdb.agg`
 * queries and plain `SELECT`/`COUNT` queries.
 */
export function calculateWhereValue(condition: QueryCondition): SQL {
  const { bm25Sql, regularSql } = _buildBM25Parts(condition)
  const anchor: SQL = bm25Sql ?? sql`${dbSchema.cacheMedia.id} @@@ pdb.all()`
  if (regularSql) return and(anchor, regularSql) ?? anchor
  return anchor
}

/** Standard PostgreSQL WHERE clause (GIN `@>` / boolean operators, no BM25). */
function _buildStandardWhere(condition: QueryCondition): SQL | null {
  if (condition.type === 'group') {
    const childConditions = condition.conditions.filter(condition => !('value' in condition) || condition.value !== '')
    if (!childConditions.length) return null
    const childSqls = childConditions.map(_buildStandardWhere).filter((s): s is SQL => s !== null)
    if (!childSqls.length) return null
    if (condition.operator === 'AND') return and(...childSqls) ?? null
    if (condition.operator === 'OR') return or(...childSqls) ?? null
    throw Error(`Unknown operator: ${condition.operator}`)
  }
  else {
    const { field, value, operator } = condition
    if (field === 'source') {
      if (operator === 'equals') {
        return sql`${dbSchema.cacheMedia.finderSourceIds} @> ARRAY[${value}]::text[]`
      }
      throw Error(`Unknown operator for source field: ${operator}`)
    }
    else if (field === 'tags') {
      if (operator === 'includes all') {
        if (!Array.isArray(value) || !value.length) return null
        return sql`${dbSchema.cacheMedia.groupIds} @> ARRAY[${sql.join(value.map(id => sql`${String(id)}`), sql`, `)}]::text[]`
      }
      throw Error(`Unknown operator for tags field: ${operator}`)
    }
    else if (field === 'type') {
      if (value === 'video') return and(eq(dbSchema.cacheMedia.hasVideo, true), eq(dbSchema.cacheMedia.hasImage, false)) ?? null
      else if (value === 'video-with-audio') return and(eq(dbSchema.cacheMedia.hasVideo, true), eq(dbSchema.cacheMedia.hasImage, false), eq(dbSchema.cacheMedia.hasAudio, true)) ?? null
      else if (value === 'video-without-audio') return and(eq(dbSchema.cacheMedia.hasVideo, true), eq(dbSchema.cacheMedia.hasImage, false), eq(dbSchema.cacheMedia.hasAudio, false)) ?? null
      else if (value === 'image') return and(eq(dbSchema.cacheMedia.hasImage, true), eq(dbSchema.cacheMedia.hasVideo, false)) ?? null
      else throw Error(`Unknown value for field "type": ${value}`)
    }
    else {
      throw Error(`Unknown field: ${field}`)
    }
  }
}

function _buildBM25Parts(condition: QueryCondition): { bm25Sql: SQL | null, regularSql: SQL | null } {
  if (condition.type === 'group') {
    const activeChildren = condition.conditions.filter(c => !('value' in c) || c.value !== '')
    if (!activeChildren.length) return { bm25Sql: null, regularSql: null }

    const childParts = activeChildren.map(_buildBM25Parts)
    const bm25Children = childParts.map(p => p.bm25Sql).filter((s): s is SQL => s !== null)
    const regularChildren = childParts.map(p => p.regularSql).filter((s): s is SQL => s !== null)

    const combinator = condition.operator === 'AND' ? and : or

    // For OR groups with mixed BM25 and regular SQL children the conditions cannot be
    // recombined separately: OR requires all operands evaluated together.
    // Fall back to regular SQL for the entire subtree so the result is always correct.
    if (condition.operator === 'OR' && bm25Children.length > 0 && regularChildren.length > 0) {
      return { bm25Sql: null, regularSql: _buildStandardWhere(condition) }
    }

    return {
      bm25Sql: bm25Children.length > 0 ? combinator(...bm25Children) ?? null : null,
      regularSql: regularChildren.length > 0 ? combinator(...regularChildren) ?? null : null,
    }
  }

  return _buildBM25FieldParts(condition)
}

function _buildBM25FieldParts(condition: QueryFieldCondition): { bm25Sql: SQL | null, regularSql: SQL | null } {
  const { field, value, operator } = condition

  if (field === 'source') {
    if (operator === 'equals') {
      if (!value) return { bm25Sql: null, regularSql: null }
      return { bm25Sql: sql`${dbSchema.cacheMedia.finderSourceIds} === ${value}`, regularSql: null }
    }
  }

  if (field === 'tags') {
    if (operator === 'includes all') {
      if (!Array.isArray(value) || !value.length) return { bm25Sql: null, regularSql: null }
      const sqls = (value as unknown[]).map(id => sql`${dbSchema.cacheMedia.groupIds} === ${String(id)}`)
      return { bm25Sql: and(...sqls) ?? null, regularSql: null }
    }
  }

  if (field === 'type') {
    // Boolean columns aren't text — use regular SQL; the BM25 anchor handles the index path
    return { bm25Sql: null, regularSql: _buildStandardWhere(condition) }
  }

  return { bm25Sql: null, regularSql: null }
}
