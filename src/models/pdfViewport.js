export function clampPdfZoom(value) { return Math.min(3, Math.max(1, value)) }

export function pdfAnchor(sheet, scroll, point) {
  return { number: sheet.number, x: (scroll.left + point.x - sheet.left) / sheet.width, y: (scroll.top + point.y - sheet.top) / sheet.height }
}

export function pdfAnchorScroll(sheet, anchor, point) {
  return { left: sheet.left + sheet.width * anchor.x - point.x, top: sheet.top + sheet.height * anchor.y - point.y }
}
