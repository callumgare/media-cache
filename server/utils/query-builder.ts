import { sql, and, or, eq, type SQL } from 'drizzle-orm'
import { dbSchema } from './drizzle'
import type { QueryCondition } from '@@/types/query-condition'

export function removeField(condition: QueryCondition, field: string): QueryCondition {
  if (condition.type === 'field') {
    return condition.field === field ? { ...condition, value: '' } : condition
  }
  return { ...condition, conditions: condition.conditions.map(c => removeField(c, field)) }
}

export function calculateWhereValue(condition: QueryCondition): SQL | null {
  if (condition.type === 'group') {
    const childConditions = condition.conditions.filter(condition => !('value' in condition) || condition.value !== '')
    if (!childConditions.length) {
      return null
    }
    const childSqls = childConditions
      .map(calculateWhereValue)
      .filter((s): s is SQL => s !== null)
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
        if (!Array.isArray(value) || !value.length) {
          return null
        }
        return sql`${dbSchema.cacheMedia.groupIds} @> ARRAY[${sql.join(value.map(id => sql`${String(id)}`), sql`, `)}]::text[]`
      }
      throw Error(`Unknown operator for tags field: ${operator}`)
    }
    else if (field === 'type') {
      if (value === 'video') {
        return and(eq(dbSchema.cacheMedia.hasVideo, true), eq(dbSchema.cacheMedia.hasImage, false)) ?? null
      }
      else if (value === 'video-with-audio') {
        return and(eq(dbSchema.cacheMedia.hasVideo, true), eq(dbSchema.cacheMedia.hasImage, false), eq(dbSchema.cacheMedia.hasAudio, true)) ?? null
      }
      else if (value === 'video-without-audio') {
        return and(eq(dbSchema.cacheMedia.hasVideo, true), eq(dbSchema.cacheMedia.hasImage, false), eq(dbSchema.cacheMedia.hasAudio, false)) ?? null
      }
      else if (value === 'image') {
        return and(eq(dbSchema.cacheMedia.hasImage, true), eq(dbSchema.cacheMedia.hasVideo, false)) ?? null
      }
      else {
        throw Error(`Unknown value for field "type": ${value}`)
      }
    }
    else {
      throw Error(`Unknown field: ${field}`)
    }
  }
}
