const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const DAY_MS = 86400000

export function parseTreeUpdatedAt(value) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

// 用本地日历日期计算天数，避免夏令时切换让一天变成 23 或 25 小时。
function calendarDay(date) { return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS }

export function getTreeDateGroup(updatedAt, now = new Date()) {
  const timestamp = parseTreeUpdatedAt(updatedAt)
  if (timestamp === null) return { key: 'undated', label: '其他对话' }
  const date = new Date(timestamp)
  const days = calendarDay(now) - calendarDay(date)
  if (days <= 0) return { key: 'today', label: '今天' }
  if (days === 1) return { key: 'yesterday', label: '昨天' }
  if (days < 7) return { key: 'week', label: '7天内' }
  if (days < 30) return { key: 'month', label: '30天内' }
  const year = date.getFullYear(), month = date.getMonth() + 1
  return { key: `${year}-${month}`, label: '{value0}年{value1}月', values: { value0: year, value1: month } }
}

export function sortTreesByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const left = parseTreeUpdatedAt(a.updatedAt) ?? -Infinity
    const right = parseTreeUpdatedAt(b.updatedAt) ?? -Infinity
    return left === right ? 0 : right - left
  })
}
