export function safeAvatarError(error) {
  return String(error?.message || error?.name || 'Unknown error')
    .replace(/https?:\/\/[^\s"'<>]+|blob:[^\s"'<>]+/gi, '[url]')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/((?:access_token|authorization|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/[a-f0-9]{32}\.webp/gi, '[avatar-file]')
    .slice(0, 300)
}

export function avatarDiagnosticText(value) {
  return [
    'Avatar diagnostics',
    `Stage: ${value.stage || '-'}`,
    `Page: workspace-mounted`,
    `Request stage: ${value.requestStage || '-'}`,
    `Avatar configured: ${Boolean(value.configured)}`,
    `Filename valid: ${value.filenameValid ?? '-'}`,
    `Token available: ${value.tokenAvailable ?? '-'}`,
    `Attempt: ${value.attempt || 0}`,
    `HTTP: ${value.httpStatus || '-'}`,
    `Content-Type: ${value.contentType || '-'}`,
    `Blob type: ${value.blobType || '-'}`,
    `Bytes: ${value.bytes ?? '-'}`,
    `Image format: ${value.imageFormat || '-'}`,
    `Image dimensions: ${value.width || 0} x ${value.height || 0}`,
    `Error: ${value.error || '-'}`,
    `Elapsed: ${value.elapsed || 0} ms`,
    'History:', ...(value.history || []),
  ].join('\n')
}

export async function avatarImageFormat(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (bytes[0] === 137 && ascii(1, 4) === 'PNG') return 'png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg'
  if (ascii(0, 3) === 'GIF') return 'gif'
  return 'unknown'
}
