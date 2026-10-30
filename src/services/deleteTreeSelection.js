// 已确认的删除逐棵执行；首个失败即停止，重试只处理未确认成功的条目。
export async function deleteTreeSelection(ids, remove, { active = () => true, onDeleted = () => {} } = {}) {
  const remaining = [...new Set(ids)], deleted = []
  while (remaining.length && active()) {
    const id = remaining[0]
    try {
      if (await remove(id) !== true) return { deleted, remaining, error: null }
    } catch (error) { return { deleted, remaining, error } }
    remaining.shift(); deleted.push(id); onDeleted(id)
  }
  return { deleted, remaining, error: null }
}
