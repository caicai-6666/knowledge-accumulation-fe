export const MIN_TREE_ZOOM = .1
export const MAX_TREE_ZOOM = 2

export function clampTreeZoom(value) {
  return Math.min(MAX_TREE_ZOOM, Math.max(MIN_TREE_ZOOM, value))
}

export function getTreeCanvasBounds(layout, viewport, zoom) {
  const width = Math.max(viewport.width, layout.width * zoom)
  const height = Math.max(viewport.height, layout.height * zoom)
  return { width, height, left: (width - layout.width * zoom) / 2, top: (height - layout.height * zoom) / 2 }
}

// 缩放前后保持锚点下的同一画布坐标，避免每次缩放跳回所选节点。
export function getAnchoredTreeScroll(scroll, anchor, oldBounds, newBounds, oldZoom, newZoom) {
  return {
    left: (scroll.left + anchor.x - oldBounds.left) / oldZoom * newZoom + newBounds.left - anchor.x,
    top: (scroll.top + anchor.y - oldBounds.top) / oldZoom * newZoom + newBounds.top - anchor.y,
  }
}
