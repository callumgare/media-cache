import { sql, type SQL } from 'drizzle-orm'
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
    let sqlOperator: SQL
    if (condition.operator === 'AND') {
      sqlOperator = sql` AND `
    }
    else if (condition.operator === 'OR') {
      sqlOperator = sql` OR `
    }
    else {
      throw Error(`Unknown operator: ${condition.operator}`)
    }
    const sqlChildConditions = childConditions
      .map(calculateWhereValue)
      .filter(sql => sql !== null)
      .map(sqlChunk => sql`(${sqlChunk})`)
    if (!sqlChildConditions.length) return null
    return sql.join(sqlChildConditions, sqlOperator)
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
        return sql`(${dbSchema.cacheMedia.hasVideo} = TRUE) AND (${dbSchema.cacheMedia.hasImage} = FALSE)`
      }
      else if (value === 'video-with-audio') {
        return sql`(${dbSchema.cacheMedia.hasVideo} = TRUE) AND (${dbSchema.cacheMedia.hasImage} = FALSE) AND (${dbSchema.cacheMedia.hasAudio} = TRUE)`
      }
      else if (value === 'video-without-audio') {
        return sql`(${dbSchema.cacheMedia.hasVideo} = TRUE) AND (${dbSchema.cacheMedia.hasImage} = FALSE) AND (${dbSchema.cacheMedia.hasAudio} = FALSE)`
      }
      else if (value === 'image') {
        return sql`(${dbSchema.cacheMedia.hasImage} = TRUE) AND (${dbSchema.cacheMedia.hasVideo} = FALSE)`
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
