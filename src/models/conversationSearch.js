import { parseTreeUpdatedAt } from './treeDateGroups.js'

const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
export function createConversationRecord(tree) {
  if (!validId(tree?.id) || typeof tree.title !== 'string' || parseTreeUpdatedAt(tree.updatedAt) === null || !Array.isArray(tree.nodes)) throw new Error('Invalid conversation cache record')
  const nodes = tree.nodes.filter(node => node.kind === 'task').map(node => {
    if (!validId(node.id) || typeof node.question !== 'string' || typeof node.answer !== 'string') throw new Error('Invalid conversation cache node')
    return { id: node.id, question: node.question, answer: node.status === 'generating' ? '' : node.answer }
  })
  return { version: 1, id: tree.id, title: tree.title, updatedAt: tree.updatedAt, nodes }
}
export function isConversationRecord(record) {
  return record?.version === 1 && validId(record.id) && typeof record.title === 'string' && parseTreeUpdatedAt(record.updatedAt) !== null && Array.isArray(record.nodes) && record.nodes.every(node => validId(node?.id) && typeof node.question === 'string' && typeof node.answer === 'string')
}
export function isCurrentConversation(record, tree) {
  return isConversationRecord(record) && record.updatedAt === tree.updatedAt
}
const fold = text => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ')
function matchRanges(text, terms) {
  let normalized = '', offset = 0
  const positions = []
  for (const character of text) {
    const folded = fold(character)
    for (let index = 0; index < folded.length; index++) positions.push([offset, offset + character.length])
    normalized += folded
    offset += character.length
  }
  const ranges = []
  for (const term of terms) {
    let index = normalized.indexOf(term)
    while (index >= 0) {
      ranges.push([positions[index][0], positions[index + term.length - 1][1]])
      index = normalized.indexOf(term, index + term.length)
    }
  }
  return ranges.sort((a, b) => a[0] - b[0])
}
export function highlightSearchText(text, query) {
  const terms = [...new Set(fold(query).trim().split(/\s+/).filter(Boolean))]
  const merged = []
  for (const range of matchRanges(text, terms)) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  let offset = 0
  const parts = []
  for (const [start, end] of merged) {
    if (start > offset) parts.push({ text: text.slice(offset, start), match: false })
    parts.push({ text: text.slice(start, end), match: true }); offset = end
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false })
  return parts
}
function excerpt(text, terms) {
  const plain = text.replace(/\s+/g, ' ').trim()
  const position = matchRanges(plain, terms)[0]?.[0] || 0
  const start = Math.max(0, position - 28)
  return `${start ? '…' : ''}${plain.slice(start, start + 110)}${plain.length > start + 110 ? '…' : ''}`
}

// 搜索输入只在已缓存的问题和最终回答中匹配；树名称只用于标识结果。
export function searchConversationNodes(records, trees, query) {
  const terms = [...new Set(fold(query).trim().split(/\s+/).filter(Boolean))]
  if (!terms.length) return []
  return trees.flatMap(tree => {
    const record = records.get(tree.id)
    if (!isCurrentConversation(record, tree)) return []
    return record.nodes.flatMap(node => {
      const question = fold(node.question), answer = fold(node.answer)
      if (!terms.every(term => question.includes(term) || answer.includes(term))) return []
      return ['question', 'answer'].flatMap(source => {
        const text = node[source]
        if (!terms.some(term => fold(text).includes(term))) return []
        return [{ id: tree.id, key: `${tree.id}:${node.id}:${source}`, nodeId: node.id, title: tree.title, updatedAt: tree.updatedAt, excerpt: excerpt(text, terms), source }]
      })
    })
  })
}
