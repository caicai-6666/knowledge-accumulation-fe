import { LocalizedError, uiText } from '../i18n/index.js'
// 沿用 contract-service-fe 的本地图片转 PDF 实现，不发送原始图片到服务端。
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'])
export function isSupportedImage(file) {
  return imageTypes.has(file.type) || (!file.type && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))
}

function joinBinaryChunks(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  chunks.forEach((chunk) => {
    result.set(chunk, offset)
    offset += chunk.length
  })
  return result
}

function createSinglePagePdf(jpegBytes, imageWidth, imageHeight) {
  const encoder = new TextEncoder()
  const chunks = []
  const objectOffsets = [0]
  let byteLength = 0

  const append = (value) => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value
    chunks.push(bytes)
    byteLength += bytes.length
  }
  const appendObject = (objectId, body) => {
    objectOffsets[objectId] = byteLength
    append(`${objectId} 0 obj\n${body}\nendobj\n`)
  }
  const formatNumber = (value) => Number(value.toFixed(3)).toString()

  const pointsPerPixel = 72 / 96
  const naturalPageWidth = imageWidth * pointsPerPixel
  const naturalPageHeight = imageHeight * pointsPerPixel
  const pageScale = Math.min(1, 1440 / Math.max(naturalPageWidth, naturalPageHeight))
  const pageWidth = naturalPageWidth * pageScale
  const pageHeight = naturalPageHeight * pageScale
  const contentStream = `q\n${formatNumber(pageWidth)} 0 0 ${formatNumber(pageHeight)} 0 0 cm\n/Im0 Do\nQ\n`
  const contentBytes = encoder.encode(contentStream)

  append('%PDF-1.4\n')
  appendObject(1, '<< /Type /Catalog /Pages 2 0 R >>')
  appendObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  appendObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(pageWidth)} ${formatNumber(pageHeight)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  )

  objectOffsets[4] = byteLength
  append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  append(jpegBytes)
  append('\nendstream\nendobj\n')
  appendObject(5, `<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream`)

  const xrefOffset = byteLength
  append('xref\n0 6\n0000000000 65535 f \n')
  for (let objectId = 1; objectId <= 5; objectId += 1) {
    append(`${String(objectOffsets[objectId]).padStart(10, '0')} 00000 n \n`)
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return joinBinaryChunks(chunks)
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas JPEG encoding failed'))
    }, 'image/jpeg', 0.94)
  })
}

export async function convertImageFileToPdf(file) {
  if (!isSupportedImage(file)) throw new LocalizedError(uiText('目前仅支持 PNG、JPEG、WebP、GIF、BMP 和 AVIF 图片'))
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const sourceImage = new Image()
      sourceImage.onload = () => resolve(sourceImage)
      sourceImage.onerror = () => reject(new Error('Image decoding failed'))
      sourceImage.src = imageUrl
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Invalid image dimensions')

    const maxRasterSide = 4096
    const rasterScale = Math.min(1, maxRasterSide / Math.max(image.naturalWidth, image.naturalHeight))
    const imageWidth = Math.max(1, Math.round(image.naturalWidth * rasterScale))
    const imageHeight = Math.max(1, Math.round(image.naturalHeight * rasterScale))
    const conversionCanvas = document.createElement('canvas')
    conversionCanvas.width = imageWidth
    conversionCanvas.height = imageHeight
    const context = conversionCanvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas is unavailable')

    context.fillStyle = '#fff'
    context.fillRect(0, 0, imageWidth, imageHeight)
    context.drawImage(image, 0, 0, imageWidth, imageHeight)
    const jpegBlob = await canvasToJpeg(conversionCanvas)
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
    const pdfBytes = createSinglePagePdf(jpegBytes, imageWidth, imageHeight)

    const extensionIndex = file.name.lastIndexOf('.')
    const baseName = (extensionIndex > 0 ? file.name.slice(0, extensionIndex) : file.name).trim()
      || 'exploration-image'
    return new File([pdfBytes], `${baseName}.pdf`, {
      type: 'application/pdf',
      lastModified: file.lastModified,
    })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}
