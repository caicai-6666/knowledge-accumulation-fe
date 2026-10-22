export function createQuestionTree(id, title = '新的问答树') {
  return { id, title, mainLeafId: null, nodes: [] }
}

export function getContextPath(tree, nodeId) {
  const path = []
  const seen = new Set()
  const nodes = new Map(tree.nodes.map(node => [node.id, node]))
  let current = nodeId
  while (current) {
    if (seen.has(current)) throw new Error('问答树中存在循环引用')
    const node = nodes.get(current)
    if (!node) throw new Error('问答任务不存在')
    seen.add(current)
    path.unshift(node)
    current = node.parentId
  }
  return path
}

export function appendQuestion(tree, { id, parentId = null, question, newBranch = false, createdAt = new Date().toISOString() }) {
  const content = question.trim()
  if (!content) throw new Error('请输入问题')
  if (tree.nodes.some(node => node.id === id)) throw new Error('任务 ID 重复')
  const parent = tree.nodes.find(node => node.id === parentId)
  if (tree.nodes.length && !parent) throw new Error('请选择有效的上下文节点')
  if (!tree.nodes.length && parentId) throw new Error('根任务不能指定父节点')
  if (parent?.status === 'generating') throw new Error('请等待当前任务结束')
  const hasContinuation = parent && tree.nodes.some(node => node.parentId === parentId && node.branchId === parent.branchId)
  const branchId = !parent ? 'main' : newBranch || hasContinuation ? id : parent.branchId
  const node = { id, parentId, branchId, question: content, answer: '', status: 'generating', createdAt }
  const continuesMain = branchId === 'main'
  return {
    tree: { ...tree, mainLeafId: continuesMain ? id : tree.mainLeafId, nodes: [...tree.nodes, node] },
    node,
  }
}

// 同一分支保持纵向延伸；新分支占独立列，避免节点互相覆盖。
export function layoutQuestionTree(tree, collapsedIds = new Set()) {
  const cardWidth = 176
  const cardHeight = 82
  const columnGap = 44
  const rowGap = 44
  const margin = 32
  const children = new Map()
  for (const node of tree.nodes) {
    if (!children.has(node.parentId)) children.set(node.parentId, [])
    children.get(node.parentId).push(node)
  }
  const positions = []
  const edges = []
  const descendantCounts = new Map()
  function countDescendants(id) {
    if (descendantCounts.has(id)) return descendantCounts.get(id)
    const count = (children.get(id) || []).reduce((total, child) => total + 1 + countDescendants(child.id), 0)
    descendantCounts.set(id, count)
    return count
  }
  let lastLane = 0
  function visit(node, lane, depth) {
    const descendantCount = countDescendants(node.id)
    const collapsed = descendantCount > 0 && collapsedIds.has(node.id)
    const position = { ...node, x: margin + lane * (cardWidth + columnGap), y: margin + depth * (cardHeight + rowGap), lane, depth, descendantCount, collapsed }
    positions.push(position)
    if (collapsed) return position
    const descendants = children.get(node.id) || []
    // 先延伸当前分支，确保显式新建的分支不会占用主干所在列。
    const ordered = [...descendants].sort((a, b) => Number(b.branchId === node.branchId) - Number(a.branchId === node.branchId))
    for (const child of ordered) {
      const childLane = child.branchId === node.branchId ? lane : ++lastLane
      const target = visit(child, childLane, depth + 1)
      const x1 = position.x + cardWidth / 2
      const y1 = position.y + cardHeight
      const x2 = target.x + cardWidth / 2
      const y2 = target.y
      edges.push({ id: child.id, parentId: node.id, path: `M${x1} ${y1} C${x1} ${y1 + rowGap / 2}, ${x2} ${y2 - rowGap / 2}, ${x2} ${y2}` })
    }
    return position
  }
  for (const root of children.get(null) || []) visit(root, 0, 0)
  return {
    nodes: positions, edges, cardWidth, cardHeight,
    width: margin * 2 + cardWidth + lastLane * (cardWidth + columnGap),
    height: margin * 2 + cardHeight + Math.max(0, ...positions.map(node => node.depth)) * (cardHeight + rowGap),
  }
}
