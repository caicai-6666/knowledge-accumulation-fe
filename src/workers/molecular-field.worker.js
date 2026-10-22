let canvas = null
let context = null
let width = 1
let height = 1
let particles = []
let tick = 0
let animationFrame = 0
let active = true
let reducedMotion = false
let destroyed = false
let ready = false

const pointer = {
  x: -1000,
  y: -1000,
  targetX: -1000,
  targetY: -1000,
  velocityX: 0,
  velocityY: 0,
  active: false,
}

const requestFrame =
  typeof self.requestAnimationFrame === 'function'
    ? (callback) => self.requestAnimationFrame(callback)
    : (callback) => self.setTimeout(() => callback(performance.now()), 16)

const cancelFrame =
  typeof self.cancelAnimationFrame === 'function'
    ? (frame) => self.cancelAnimationFrame(frame)
    : (frame) => self.clearTimeout(frame)

function influenceRadius() {
  return width <= 768 ? 400 : 800
}

function particleCount() {
  return width <= 768 ? 80 : 300
}

function createParticle() {
  const kindSeed = Math.random()
  let kind = 'dot'
  let satelliteCount = 0

  if (kindSeed >= 0.4 && kindSeed < 0.8) {
    kind = 'simple'
    satelliteCount = Math.floor(Math.random() * 2) + 1
  } else if (kindSeed >= 0.8) {
    kind = 'complex'
    satelliteCount = Math.floor(Math.random() * 3) + 3
  }

  const satelliteRadius = kind === 'complex' ? 35 : 18

  return {
    baseX: Math.random() * width,
    baseY: Math.random() * height,
    x: 0,
    y: 0,
    velocityX: (Math.random() - 0.5) * 0.05,
    velocityY: (Math.random() - 0.5) * 0.05,
    baseSize: Math.random() * 0.5 + 0.3,
    phase: Math.random() * Math.PI * 2,
    satellites: Array.from({ length: satelliteCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: Math.random() * satelliteRadius + 10,
      size: Math.random() * 0.4 + 0.2,
    })),
  }
}

function resetParticles() {
  particles = Array.from({ length: particleCount() }, createParticle)
}

function resize(nextWidth, nextHeight) {
  width = Math.max(1, Math.round(nextWidth))
  height = Math.max(1, Math.round(nextHeight))
  canvas.width = width
  canvas.height = height

  if (!pointer.active) {
    pointer.x = width * 0.5
    pointer.y = height * 0.5
    pointer.targetX = pointer.x
    pointer.targetY = pointer.y
    pointer.velocityX = 0
    pointer.velocityY = 0
  }

  resetParticles()
}

function updatePointer() {
  if (!pointer.active && width && height) {
    const phase = tick * 0.006
    pointer.targetX =
      width * (0.5 + Math.sin(phase) * 0.28 + Math.sin(phase * 1.73 + 1.2) * 0.12)
    pointer.targetY =
      height *
      (0.5 + Math.cos(phase * 0.83 + 0.7) * 0.24 + Math.sin(phase * 1.31 + 2.4) * 0.1)
  }

  pointer.velocityX += (pointer.targetX - pointer.x) * 0.035
  pointer.velocityY += (pointer.targetY - pointer.y) * 0.035
  pointer.velocityX *= 0.78
  pointer.velocityY *= 0.78
  pointer.x += pointer.velocityX
  pointer.y += pointer.velocityY
}

function colorForDistance(distance) {
  const radius = influenceRadius()

  if (pointer.x < 0 || distance > radius) return '245, 245, 245'

  let red
  let green
  let blue

  if (distance < 150) {
    red = 149
    green = 202
    blue = 0
  } else if (distance < 350) {
    const progress = (distance - 150) / 200
    red = 149 - 149 * progress
    green = 202 - 22 * progress
    blue = 255 * progress
  } else {
    const progress = (distance - 350) / (radius - 350)
    red = 180 * progress
    green = 180 - 80 * progress
    blue = 255
    red += (245 - red) * progress
    green += (245 - green) * progress
    blue += (245 - blue) * progress
  }

  return `${Math.floor(red)}, ${Math.floor(green)}, ${Math.floor(blue)}`
}

function moveParticle(particle) {
  particle.baseX += particle.velocityX
  particle.baseY += particle.velocityY

  if (particle.baseX < -50) particle.baseX = width + 50
  if (particle.baseX > width + 50) particle.baseX = -50
  if (particle.baseY < -50) particle.baseY = height + 50
  if (particle.baseY > height + 50) particle.baseY = -50
}

function drawParticle(particle) {
  const deltaX = pointer.x - particle.baseX
  const deltaY = pointer.y - particle.baseY
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
  const radius = influenceRadius()
  let influence = 0
  let wave = 0
  let intensity = 0

  if (pointer.x > 0 && distance < radius) {
    influence = (1 - distance / radius) ** 1.5
    wave = (Math.sin(tick * 0.02 - distance * 0.01) + 1) * 0.45 + 0.1
    intensity = influence * wave

    const displacement =
      Math.sin(tick * 0.02 - distance * 0.01 + particle.phase) * influence * 25
    particle.x = particle.baseX + (deltaX / (distance || 1)) * displacement
    particle.y = particle.baseY + (deltaY / (distance || 1)) * displacement
  } else {
    particle.x = particle.baseX
    particle.y = particle.baseY
  }

  const color = colorForDistance(distance)
  const baseOpacity = 0.05
  const opacity = baseOpacity + (0.6 + wave * 0.4 - baseOpacity) * influence
  const lineWidth = 0.3 + intensity * 2.5
  const size = particle.baseSize * (1 + intensity * 6)

  context.beginPath()
  for (const satellite of particle.satellites) {
    const angle = satellite.angle + tick * 0.003
    const satelliteDistance = satellite.distance * (1 + intensity * 0.5)
    const satelliteX = particle.x + Math.cos(angle) * satelliteDistance
    const satelliteY = particle.y + Math.sin(angle) * satelliteDistance
    context.moveTo(particle.x, particle.y)
    context.lineTo(satelliteX, satelliteY)
  }
  context.lineWidth = lineWidth
  context.strokeStyle = `rgba(${color}, ${opacity * 0.8})`
  context.stroke()

  for (const satellite of particle.satellites) {
    const angle = satellite.angle + tick * 0.003
    const satelliteDistance = satellite.distance * (1 + intensity * 0.5)
    const satelliteX = particle.x + Math.cos(angle) * satelliteDistance
    const satelliteY = particle.y + Math.sin(angle) * satelliteDistance
    const satelliteSize = satellite.size * (1 + intensity * 5)
    context.beginPath()
    context.arc(satelliteX, satelliteY, satelliteSize, 0, Math.PI * 2)
    context.fillStyle = `rgba(${color}, ${opacity * 0.9})`
    context.fill()
  }

  context.beginPath()
  context.arc(particle.x, particle.y, size, 0, Math.PI * 2)
  context.fillStyle = `rgba(${color}, ${opacity})`

  if (intensity > 0.05) {
    context.shadowBlur = intensity * 25
    context.shadowColor = `rgba(${color}, ${opacity})`
    context.fill()
    context.shadowBlur = 0
  } else {
    context.fill()
  }
}

function draw() {
  context.clearRect(0, 0, width, height)
  updatePointer()

  for (const particle of particles) {
    moveParticle(particle)
    drawParticle(particle)
  }

  if (!ready) {
    ready = true
    self.postMessage({ type: 'ready' })
  }
}

function animate() {
  animationFrame = 0

  if (!active || reducedMotion || destroyed || !context) return

  tick += 1
  draw()
  animationFrame = requestFrame(animate)
}

function start() {
  if (!context || destroyed) return

  if (reducedMotion) {
    draw()
    return
  }

  if (active && !animationFrame) animationFrame = requestFrame(animate)
}

function stop() {
  if (animationFrame) cancelFrame(animationFrame)
  animationFrame = 0
}

self.addEventListener('message', (event) => {
  const message = event.data

  if (!message || destroyed) return

  try {
    if (message.type === 'init') {
      canvas = message.canvas
      reducedMotion = message.reducedMotion
      active = message.active
      context = canvas.getContext('2d', { alpha: true, desynchronized: true })

      if (!context) throw new Error('无法创建 OffscreenCanvas 2D 上下文')

      resize(message.width, message.height)
      start()
      return
    }

    if (message.type === 'resize') {
      resize(message.width, message.height)
      if (reducedMotion || !active) draw()
      return
    }

    if (message.type === 'pointer') {
      pointer.targetX = message.x
      pointer.targetY = message.y
      pointer.active = true
      return
    }

    if (message.type === 'pointer-leave') {
      pointer.active = false
      return
    }

    if (message.type === 'set-active') {
      active = message.active
      if (active) start()
      else stop()
      return
    }

    if (message.type === 'set-reduced-motion') {
      reducedMotion = message.reducedMotion
      stop()
      start()
      return
    }

    if (message.type === 'destroy') {
      destroyed = true
      stop()
      particles = []
      context = null
      canvas = null
    }
  } catch (error) {
    stop()
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '未知渲染异常',
    })
  }
})
