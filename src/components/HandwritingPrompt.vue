<script setup>
import { englishHandwritingCandidates } from '../models/englishHandwriting.js'
import { locale, t } from '../i18n/index.js'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useId, watch } from 'vue'

// 笔画与视觉节奏复用 contract-service-fe；文案和生命周期适配统一问答入口。
const props = defineProps({ active: { type: Boolean, default: true } })
const gradientId = `knowledge-handwriting-${useId()}`
const running = ref(false)
const reducedMotion = ref(false)
let motionQuery
let deactivated = false

const PROMPT_HOLD_DURATION = 3200
const PROMPT_FADE_DURATION = 680

const pathXIndexes = {
  M: [0],
  L: [0],
  C: [0, 2, 4],
  Q: [0, 2],
}

function offsetPath(commands, offsetX) {
  return commands
    .map(([command, ...values]) => {
      const xIndexes = pathXIndexes[command] ?? []
      const adjustedValues = values.map((value, index) =>
        xIndexes.includes(index) ? value + offsetX : value,
      )
      return `${command}${adjustedValues.join(' ')}`
    })
    .join(' ')
}

function createPlayfulTemplate({ key, label, hint, period, glyphs, advances, viewBox, width }) {
  const strokes = []
  let elapsedTime = 0.08
  let offsetX = 0

  glyphs.forEach((glyph, glyphIndex) => {
    glyph.forEach(({ commands, duration = 0.14 }) => {
      strokes.push({
        d: offsetPath(commands, offsetX),
        delay: elapsedTime,
        duration,
      })
      elapsedTime += duration + 0.012
    })

    elapsedTime += 0.035
    offsetX += advances[glyphIndex]
  })

  return {
    key,
    label,
    hint,
    period,
    viewBox,
    width,
    gradientEnd: offsetX,
    strokes,
  }
}

const templates = [
  {
    key: 'ni-hao',
    label: '你好',
    hint: '从一个问题开始，沿着思路继续探索。',
    viewBox: '28 22 490 210',
    width: '280px',
    strokes: [
      { d: 'M88 48 C80 67 68 92 55 116', delay: 0.08, duration: 0.23 },
      { d: 'M110 42 C98 68 85 92 79 118 C73 145 76 180 74 211', delay: 0.27, duration: 0.38 },
      { d: 'M116 89 C139 72 172 68 191 78 C207 87 202 105 184 120', delay: 0.6, duration: 0.3 },
      { d: 'M151 108 C145 129 138 151 137 169 C136 188 145 198 159 197 C177 195 185 181 180 166 C175 150 159 145 145 151 C128 158 117 176 105 191', delay: 0.84, duration: 0.48 },
      { d: 'M112 148 C106 160 99 173 91 183', delay: 1.25, duration: 0.17 },
      { d: 'M184 144 C199 157 210 172 215 187', delay: 1.36, duration: 0.2 },
      { d: 'M316 52 C309 81 299 111 289 137 C284 151 293 160 309 165 C330 172 347 184 358 200', delay: 1.54, duration: 0.38 },
      { d: 'M350 87 C342 119 330 152 313 177 C301 194 289 202 276 207', delay: 1.85, duration: 0.34 },
      { d: 'M278 127 C311 120 343 121 372 131', delay: 2.12, duration: 0.25 },
      { d: 'M393 70 C414 59 447 57 459 67 C471 79 458 91 443 101 C431 109 422 119 419 132', delay: 2.31, duration: 0.36 },
      { d: 'M434 106 C431 132 429 159 431 185 C432 203 420 211 405 200', delay: 2.61, duration: 0.32 },
      { d: 'M380 135 C416 128 458 128 490 137', delay: 2.87, duration: 0.29 },
    ],
  },
  {
    key: 'hello',
    label: 'Hello',
    hint: '欢迎回来，今天想从哪里开始？',
    viewBox: '28 22 350 205',
    width: '300px',
    strokes: [
      { d: 'M88 43 C77 75 67 118 62 165 C60 190 66 205 75 204', delay: 0.08, duration: 0.38 },
      { d: 'M132 37 C120 77 110 119 108 158 C107 183 114 197 126 194', delay: 0.4, duration: 0.38 },
      { d: 'M63 124 C85 113 113 111 144 119', delay: 0.72, duration: 0.25 },
      { d: 'M147 146 C164 145 181 135 180 123 C180 113 168 111 157 118 C143 128 146 151 160 160 C177 171 195 158 207 145', delay: 0.93, duration: 0.4 },
      { d: 'M207 145 C220 124 230 93 231 61 C232 40 222 31 213 43 C201 59 207 85 221 102 C235 119 239 137 236 153', delay: 1.28, duration: 0.44 },
      { d: 'M244 146 C257 124 267 92 268 59 C269 38 259 31 251 43 C240 59 245 84 259 102 C273 120 278 138 275 154', delay: 1.68, duration: 0.44 },
      { d: 'M305 130 C290 138 288 156 298 166 C310 178 333 170 340 153 C347 136 338 124 323 126 C306 128 299 142 304 155 C310 170 333 176 355 158', delay: 2.08, duration: 0.44 },
    ],
  },
  createPlayfulTemplate({
    key: 'what-can-i-do',
    label: '我能为你做什么？',
    hint: '说说你的问题，我们一起梳理。',
    viewBox: '0 18 1185 194',
    width: '455px',
    advances: [155, 155, 155, 155, 155, 155, 155, 100],
    glyphs: [
      [
        { commands: [['M', 20, 65], ['C', 48, 59, 82, 50, 112, 40]], duration: 0.16 },
        { commands: [['M', 20, 91], ['C', 52, 84, 91, 80, 130, 81]], duration: 0.17 },
        { commands: [['M', 78, 43], ['C', 76, 82, 77, 129, 81, 171], ['C', 83, 188, 71, 196, 60, 182]], duration: 0.22 },
        { commands: [['M', 102, 51], ['C', 103, 91, 110, 129, 126, 160], ['C', 134, 176, 141, 171, 143, 153]], duration: 0.22 },
        { commands: [['M', 119, 96], ['C', 104, 122, 83, 149, 54, 171]], duration: 0.17 },
        { commands: [['M', 124, 36], ['C', 131, 41, 136, 47, 140, 54]], duration: 0.09 },
      ],
      [
        { commands: [['M', 22, 70], ['C', 44, 57, 68, 43, 91, 34], ['C', 85, 48, 75, 61, 62, 72], ['C', 82, 71, 101, 71, 119, 74]], duration: 0.22 },
        { commands: [['M', 84, 53], ['C', 92, 58, 99, 64, 105, 72]], duration: 0.09 },
        { commands: [['M', 31, 91], ['C', 29, 123, 28, 157, 26, 188]], duration: 0.16 },
        { commands: [['M', 31, 92], ['C', 51, 87, 74, 87, 89, 91], ['C', 91, 117, 90, 146, 88, 173], ['C', 87, 188, 78, 191, 67, 181]], duration: 0.22 },
        { commands: [['M', 34, 117], ['C', 51, 113, 71, 113, 88, 116]], duration: 0.11 },
        { commands: [['M', 33, 146], ['C', 51, 142, 71, 142, 88, 145]], duration: 0.11 },
        { commands: [['M', 105, 94], ['C', 119, 86, 131, 82, 141, 82]], duration: 0.1 },
        { commands: [['M', 112, 85], ['C', 110, 103, 110, 119, 112, 128], ['C', 121, 128, 132, 122, 140, 114]], duration: 0.15 },
        { commands: [['M', 103, 149], ['C', 117, 140, 130, 135, 141, 134]], duration: 0.1 },
        { commands: [['M', 111, 140], ['C', 108, 158, 108, 175, 111, 184], ['C', 122, 183, 133, 177, 141, 167]], duration: 0.15 },
      ],
      [
        { commands: [['M', 57, 39], ['C', 63, 42, 68, 47, 72, 53]], duration: 0.08 },
        { commands: [['M', 28, 83], ['C', 62, 76, 100, 73, 128, 78], ['C', 124, 112, 116, 148, 104, 177], ['C', 99, 190, 87, 192, 74, 182]], duration: 0.24 },
        { commands: [['M', 78, 57], ['C', 69, 92, 56, 127, 36, 163]], duration: 0.17 },
        { commands: [['M', 75, 113], ['C', 85, 120, 92, 129, 97, 138]], duration: 0.1 },
      ],
      [
        { commands: [['M', 30, 46], ['C', 25, 62, 18, 79, 10, 95]], duration: 0.12 },
        { commands: [['M', 43, 40], ['C', 35, 61, 27, 84, 24, 107], ['C', 22, 133, 24, 160, 23, 190]], duration: 0.2 },
        { commands: [['M', 53, 84], ['C', 72, 69, 99, 66, 114, 75], ['C', 128, 84, 124, 100, 109, 113]], duration: 0.19 },
        { commands: [['M', 84, 105], ['C', 80, 124, 75, 143, 75, 159], ['C', 74, 177, 82, 187, 94, 185], ['C', 109, 184, 116, 171, 112, 158], ['C', 108, 144, 94, 140, 83, 146], ['C', 70, 152, 61, 168, 52, 181]], duration: 0.24 },
        { commands: [['M', 60, 145], ['C', 54, 157, 48, 168, 42, 177]], duration: 0.09 },
        { commands: [['M', 116, 141], ['C', 128, 153, 137, 168, 141, 182]], duration: 0.11 },
      ],
      [
        { commands: [['M', 28, 46], ['C', 22, 64, 14, 84, 6, 99]], duration: 0.12 },
        { commands: [['M', 42, 40], ['C', 33, 69, 25, 102, 25, 139], ['C', 25, 161, 27, 181, 26, 193]], duration: 0.2 },
        { commands: [['M', 72, 48], ['C', 70, 72, 70, 96, 70, 119]], duration: 0.14 },
        { commands: [['M', 49, 74], ['C', 69, 69, 91, 69, 108, 73]], duration: 0.12 },
        { commands: [['M', 54, 104], ['C', 70, 100, 89, 100, 102, 104], ['L', 100, 147], ['C', 84, 144, 69, 144, 55, 147], ['L', 54, 104]], duration: 0.2 },
        { commands: [['M', 127, 54], ['C', 122, 73, 115, 91, 106, 105]], duration: 0.12 },
        { commands: [['M', 111, 91], ['C', 124, 86, 136, 84, 145, 86]], duration: 0.1 },
        { commands: [['M', 130, 91], ['C', 127, 118, 120, 145, 108, 166]], duration: 0.16 },
        { commands: [['M', 128, 115], ['C', 133, 138, 139, 158, 147, 176]], duration: 0.14 },
      ],
      [
        { commands: [['M', 30, 46], ['C', 24, 64, 16, 84, 7, 100]], duration: 0.12 },
        { commands: [['M', 43, 40], ['C', 34, 69, 27, 102, 26, 138], ['C', 25, 161, 27, 180, 26, 193]], duration: 0.2 },
        { commands: [['M', 90, 42], ['C', 87, 80, 87, 129, 88, 190]], duration: 0.2 },
        { commands: [['M', 55, 95], ['C', 83, 90, 115, 90, 144, 95]], duration: 0.17 },
      ],
      [
        { commands: [['M', 92, 42], ['C', 78, 76, 58, 111, 31, 143]], duration: 0.18 },
        { commands: [['M', 82, 92], ['C', 69, 117, 57, 141, 49, 168], ['C', 76, 166, 103, 162, 126, 155]], duration: 0.2 },
        { commands: [['M', 104, 127], ['C', 120, 144, 133, 162, 142, 181]], duration: 0.14 },
      ],
      [
        { commands: [['M', 24, 61], ['C', 29, 31, 61, 24, 84, 38], ['C', 105, 51, 103, 79, 81, 95], ['C', 57, 112, 51, 125, 53, 145]], duration: 0.28 },
        { commands: [['M', 53, 181], ['L', 54, 183]], duration: 0.1 },
      ],
    ],
  }),
  createPlayfulTemplate({
    key: 'today-focus',
    label: '今天关注些什么？',
    hint: '告诉我你想了解的知识或业务问题。',
    viewBox: '0 18 1185 194',
    width: '455px',
    advances: [155, 155, 155, 155, 155, 155, 155, 100],
    glyphs: [
      [
        { commands: [['M', 78, 32], ['C', 65, 51, 47, 68, 24, 82]], duration: 0.16 },
        { commands: [['M', 78, 32], ['C', 94, 50, 112, 66, 137, 80]], duration: 0.16 },
        { commands: [['M', 72, 70], ['C', 79, 76, 84, 82, 88, 89]], duration: 0.09 },
        { commands: [['M', 45, 105], ['C', 70, 100, 101, 99, 125, 103], ['C', 115, 118, 104, 133, 92, 146], ['C', 82, 158, 85, 172, 96, 181]], duration: 0.24 },
      ],
      [
        { commands: [['M', 34, 60], ['C', 65, 54, 96, 54, 126, 58]], duration: 0.14 },
        { commands: [['M', 20, 98], ['C', 56, 92, 101, 92, 140, 96]], duration: 0.17 },
        { commands: [['M', 82, 58], ['C', 79, 96, 69, 130, 48, 158], ['C', 37, 173, 25, 183, 15, 188]], duration: 0.22 },
        { commands: [['M', 81, 99], ['C', 92, 129, 112, 158, 141, 184]], duration: 0.2 },
      ],
      [
        { commands: [['M', 48, 39], ['C', 56, 45, 62, 52, 67, 60]], duration: 0.09 },
        { commands: [['M', 106, 38], ['C', 100, 48, 95, 56, 91, 63]], duration: 0.09 },
        { commands: [['M', 29, 76], ['C', 57, 70, 99, 70, 129, 75]], duration: 0.15 },
        { commands: [['M', 20, 108], ['C', 55, 102, 102, 102, 140, 107]], duration: 0.18 },
        { commands: [['M', 80, 75], ['C', 75, 111, 64, 142, 43, 168], ['C', 33, 180, 22, 188, 13, 191]], duration: 0.22 },
        { commands: [['M', 81, 108], ['C', 94, 137, 115, 163, 143, 184]], duration: 0.2 },
      ],
      [
        { commands: [['M', 23, 47], ['C', 30, 51, 36, 57, 41, 63]], duration: 0.09 },
        { commands: [['M', 16, 84], ['C', 23, 87, 30, 91, 36, 96]], duration: 0.09 },
        { commands: [['M', 37, 116], ['C', 31, 139, 22, 161, 13, 181]], duration: 0.15 },
        { commands: [['M', 91, 35], ['C', 96, 40, 100, 46, 103, 52]], duration: 0.08 },
        { commands: [['M', 58, 70], ['C', 82, 65, 109, 65, 131, 69]], duration: 0.13 },
        { commands: [['M', 94, 54], ['C', 92, 91, 93, 133, 95, 176]], duration: 0.2 },
        { commands: [['M', 62, 112], ['C', 82, 107, 107, 107, 127, 111]], duration: 0.12 },
        { commands: [['M', 49, 177], ['C', 77, 171, 111, 171, 140, 176]], duration: 0.16 },
      ],
      [
        { commands: [['M', 45, 42], ['C', 44, 73, 43, 102, 42, 129]], duration: 0.16 },
        { commands: [['M', 20, 84], ['C', 35, 79, 51, 79, 65, 82]], duration: 0.11 },
        { commands: [['M', 20, 123], ['C', 40, 117, 59, 116, 77, 119]], duration: 0.12 },
        { commands: [['M', 97, 43], ['C', 95, 69, 96, 91, 98, 107], ['C', 112, 105, 125, 98, 137, 88]], duration: 0.18 },
        { commands: [['M', 97, 70], ['C', 112, 62, 127, 58, 141, 58]], duration: 0.1 },
        { commands: [['M', 36, 146], ['C', 62, 141, 96, 141, 124, 145]], duration: 0.14 },
        { commands: [['M', 21, 180], ['C', 58, 174, 104, 174, 141, 179]], duration: 0.17 },
      ],
      [
        { commands: [['M', 30, 46], ['C', 24, 64, 16, 84, 7, 100]], duration: 0.12 },
        { commands: [['M', 43, 40], ['C', 34, 69, 27, 102, 26, 138], ['C', 25, 161, 27, 180, 26, 193]], duration: 0.2 },
        { commands: [['M', 90, 42], ['C', 87, 80, 87, 129, 88, 190]], duration: 0.2 },
        { commands: [['M', 55, 95], ['C', 83, 90, 115, 90, 144, 95]], duration: 0.17 },
      ],
      [
        { commands: [['M', 92, 42], ['C', 78, 76, 58, 111, 31, 143]], duration: 0.18 },
        { commands: [['M', 82, 92], ['C', 69, 117, 57, 141, 49, 168], ['C', 76, 166, 103, 162, 126, 155]], duration: 0.2 },
        { commands: [['M', 104, 127], ['C', 120, 144, 133, 162, 142, 181]], duration: 0.14 },
      ],
      [
        { commands: [['M', 24, 61], ['C', 29, 31, 61, 24, 84, 38], ['C', 105, 51, 103, 79, 81, 95], ['C', 57, 112, 51, 125, 53, 145]], duration: 0.28 },
        { commands: [['M', 53, 181], ['L', 54, 183]], duration: 0.1 },
      ],
    ],
  }),
  createPlayfulTemplate({
    key: 'sort-together',
    label: '一起梳理一下？',
    hint: '理清思路，让每一个问题生长出新的可能。',
    viewBox: '0 18 1040 194',
    width: '445px',
    advances: [130, 175, 180, 175, 130, 150, 100],
    glyphs: [
      [
        { commands: [['M', 12, 106], ['C', 45, 98, 87, 98, 120, 103]], duration: 0.2 },
      ],
      [
        { commands: [['M', 55, 31], ['C', 53, 57, 53, 83, 54, 105]], duration: 0.14 },
        { commands: [['M', 20, 59], ['C', 43, 54, 72, 54, 96, 58]], duration: 0.13 },
        { commands: [['M', 10, 95], ['C', 38, 89, 70, 89, 101, 94]], duration: 0.15 },
        { commands: [['M', 55, 94], ['C', 51, 119, 43, 144, 31, 164]], duration: 0.15 },
        { commands: [['M', 35, 130], ['C', 55, 125, 78, 125, 98, 129]], duration: 0.12 },
        { commands: [['M', 55, 128], ['C', 71, 151, 91, 169, 116, 178], ['C', 137, 185, 157, 181, 169, 174]], duration: 0.2 },
        { commands: [['M', 101, 65], ['C', 124, 60, 149, 61, 164, 66], ['C', 160, 81, 156, 94, 151, 106]], duration: 0.18 },
        { commands: [['M', 102, 107], ['C', 122, 103, 141, 103, 156, 106]], duration: 0.11 },
        { commands: [['M', 103, 68], ['C', 100, 91, 100, 115, 103, 135], ['C', 119, 139, 140, 139, 155, 135], ['C', 162, 133, 165, 127, 165, 119]], duration: 0.2 },
      ],
      [
        { commands: [['M', 43, 31], ['C', 42, 73, 42, 129, 43, 184]], duration: 0.2 },
        { commands: [['M', 8, 72], ['C', 30, 67, 55, 67, 78, 71]], duration: 0.13 },
        { commands: [['M', 42, 75], ['C', 33, 99, 21, 120, 8, 136]], duration: 0.14 },
        { commands: [['M', 44, 81], ['C', 56, 97, 67, 114, 79, 132]], duration: 0.14 },
        { commands: [['M', 119, 32], ['C', 125, 37, 130, 43, 133, 50]], duration: 0.08 },
        { commands: [['M', 88, 62], ['C', 112, 57, 145, 57, 171, 61]], duration: 0.14 },
        { commands: [['M', 124, 62], ['C', 114, 78, 103, 92, 91, 103], ['C', 112, 102, 134, 101, 154, 103]], duration: 0.17 },
        { commands: [['M', 136, 79], ['C', 147, 86, 155, 94, 161, 103]], duration: 0.1 },
        { commands: [['M', 104, 113], ['C', 102, 140, 96, 164, 85, 182]], duration: 0.15 },
        { commands: [['M', 132, 109], ['C', 130, 137, 130, 160, 132, 183]], duration: 0.16 },
        { commands: [['M', 157, 109], ['C', 157, 136, 161, 159, 169, 178]], duration: 0.16 },
      ],
      [
        { commands: [['M', 10, 53], ['C', 28, 49, 51, 49, 70, 52]], duration: 0.12 },
        { commands: [['M', 41, 50], ['C', 40, 85, 40, 128, 41, 168]], duration: 0.18 },
        { commands: [['M', 12, 96], ['C', 31, 92, 52, 92, 70, 95]], duration: 0.11 },
        { commands: [['M', 7, 169], ['C', 30, 164, 55, 164, 77, 168]], duration: 0.13 },
        { commands: [['M', 91, 43], ['C', 90, 75, 90, 110, 91, 143]], duration: 0.16 },
        { commands: [['M', 91, 44], ['C', 111, 39, 143, 39, 163, 44], ['L', 161, 143], ['C', 137, 139, 113, 139, 91, 143]], duration: 0.22 },
        { commands: [['M', 95, 75], ['C', 114, 71, 142, 71, 161, 74]], duration: 0.11 },
        { commands: [['M', 94, 108], ['C', 114, 104, 142, 104, 161, 107]], duration: 0.11 },
        { commands: [['M', 127, 42], ['C', 125, 81, 126, 124, 127, 168]], duration: 0.19 },
        { commands: [['M', 82, 169], ['C', 106, 164, 143, 164, 170, 168]], duration: 0.14 },
      ],
      [
        { commands: [['M', 10, 104], ['C', 43, 97, 86, 98, 120, 104]], duration: 0.2 },
      ],
      [
        { commands: [['M', 12, 65], ['C', 48, 58, 96, 59, 137, 64]], duration: 0.18 },
        { commands: [['M', 75, 64], ['C', 73, 102, 74, 147, 76, 190]], duration: 0.2 },
        { commands: [['M', 80, 101], ['C', 96, 111, 109, 122, 120, 136]], duration: 0.13 },
      ],
      [
        { commands: [['M', 24, 61], ['C', 29, 31, 61, 24, 84, 38], ['C', 105, 51, 103, 79, 81, 95], ['C', 57, 112, 51, 125, 53, 145]], duration: 0.28 },
        { commands: [['M', 53, 181], ['L', 54, 183]], duration: 0.1 },
      ],
    ],
  }),
  createPlayfulTemplate({
    key: 'good-morning',
    label: '早上好',
    hint: '新的一天，从哪个问题开始？',
    period: 'morning',
    viewBox: '0 18 520 194',
    width: '330px',
    advances: [180, 160, 180],
    glyphs: [
      [
        { commands: [['M', 31, 34], ['C', 29, 61, 29, 91, 30, 120]], duration: 0.16 },
        { commands: [['M', 31, 35], ['C', 62, 28, 107, 28, 139, 34], ['C', 141, 62, 140, 91, 138, 119], ['C', 104, 115, 65, 115, 30, 120]], duration: 0.24 },
        { commands: [['M', 34, 64], ['C', 63, 59, 108, 59, 138, 63]], duration: 0.14 },
        { commands: [['M', 33, 92], ['C', 63, 87, 108, 87, 138, 91]], duration: 0.14 },
        { commands: [['M', 86, 111], ['C', 84, 136, 84, 162, 86, 191]], duration: 0.17 },
        { commands: [['M', 15, 149], ['C', 55, 142, 116, 142, 163, 148]], duration: 0.18 },
      ],
      [
        { commands: [['M', 78, 40], ['C', 76, 74, 76, 111, 78, 151]], duration: 0.18 },
        { commands: [['M', 78, 91], ['C', 98, 87, 118, 88, 133, 92]], duration: 0.12 },
        { commands: [['M', 18, 169], ['C', 55, 163, 105, 163, 146, 168]], duration: 0.18 },
      ],
      [
        { commands: [['M', 48, 44], ['C', 43, 70, 35, 95, 28, 118], ['C', 24, 131, 31, 138, 43, 143], ['C', 59, 149, 72, 160, 81, 177]], duration: 0.2 },
        { commands: [['M', 77, 75], ['C', 70, 103, 61, 131, 48, 153], ['C', 39, 167, 30, 174, 20, 178]], duration: 0.18 },
        { commands: [['M', 19, 109], ['C', 44, 103, 69, 103, 92, 112]], duration: 0.14 },
        { commands: [['M', 112, 59], ['C', 130, 49, 155, 48, 164, 57], ['C', 174, 67, 164, 77, 151, 86], ['C', 140, 94, 133, 103, 131, 114]], duration: 0.2 },
        { commands: [['M', 143, 90], ['C', 140, 113, 139, 136, 141, 158], ['C', 142, 173, 132, 180, 120, 170]], duration: 0.18 },
        { commands: [['M', 101, 116], ['C', 128, 110, 158, 110, 178, 117]], duration: 0.16 },
      ],
    ],
  }),
  createPlayfulTemplate({
    key: 'good-afternoon',
    label: '下午好',
    hint: '继续探索今天感兴趣的话题吧。',
    period: 'afternoon',
    viewBox: '0 18 500 194',
    width: '330px',
    advances: [150, 170, 180],
    glyphs: [
      [
        { commands: [['M', 12, 65], ['C', 48, 58, 96, 59, 137, 64]], duration: 0.18 },
        { commands: [['M', 75, 64], ['C', 73, 102, 74, 147, 76, 190]], duration: 0.2 },
        { commands: [['M', 80, 101], ['C', 96, 111, 109, 122, 120, 136]], duration: 0.13 },
      ],
      [
        { commands: [['M', 104, 34], ['C', 91, 49, 77, 62, 61, 73]], duration: 0.14 },
        { commands: [['M', 55, 68], ['C', 77, 62, 104, 62, 127, 66]], duration: 0.13 },
        { commands: [['M', 25, 108], ['C', 64, 101, 113, 102, 151, 108]], duration: 0.18 },
        { commands: [['M', 89, 66], ['C', 87, 102, 87, 142, 89, 190]], duration: 0.2 },
      ],
      [
        { commands: [['M', 48, 44], ['C', 43, 70, 35, 95, 28, 118], ['C', 24, 131, 31, 138, 43, 143], ['C', 59, 149, 72, 160, 81, 177]], duration: 0.2 },
        { commands: [['M', 77, 75], ['C', 70, 103, 61, 131, 48, 153], ['C', 39, 167, 30, 174, 20, 178]], duration: 0.18 },
        { commands: [['M', 19, 109], ['C', 44, 103, 69, 103, 92, 112]], duration: 0.14 },
        { commands: [['M', 112, 59], ['C', 130, 49, 155, 48, 164, 57], ['C', 174, 67, 164, 77, 151, 86], ['C', 140, 94, 133, 103, 131, 114]], duration: 0.2 },
        { commands: [['M', 143, 90], ['C', 140, 113, 139, 136, 141, 158], ['C', 142, 173, 132, 180, 120, 170]], duration: 0.18 },
        { commands: [['M', 101, 116], ['C', 128, 110, 158, 110, 178, 117]], duration: 0.16 },
      ],
    ],
  }),
  createPlayfulTemplate({
    key: 'good-evening',
    label: '晚上好',
    hint: '加班辛苦了',
    period: 'evening',
    viewBox: '0 18 520 194',
    width: '335px',
    advances: [180, 160, 180],
    glyphs: [
      [
        { commands: [['M', 14, 55], ['C', 13, 87, 13, 121, 15, 151]], duration: 0.16 },
        { commands: [['M', 15, 56], ['C', 27, 51, 45, 51, 58, 55], ['L', 56, 149], ['C', 42, 145, 28, 145, 15, 151]], duration: 0.2 },
        { commands: [['M', 18, 86], ['C', 30, 82, 45, 82, 57, 85]], duration: 0.1 },
        { commands: [['M', 17, 116], ['C', 30, 112, 45, 112, 56, 115]], duration: 0.1 },
        { commands: [['M', 95, 31], ['C', 85, 48, 72, 62, 58, 74]], duration: 0.14 },
        { commands: [['M', 89, 47], ['C', 109, 41, 131, 42, 144, 48], ['C', 137, 60, 129, 70, 120, 80]], duration: 0.16 },
        { commands: [['M', 75, 83], ['C', 98, 78, 128, 78, 149, 84], ['C', 150, 104, 148, 123, 145, 138], ['C', 120, 134, 96, 134, 74, 139], ['L', 75, 83]], duration: 0.22 },
        { commands: [['M', 78, 109], ['C', 99, 104, 127, 104, 147, 108]], duration: 0.12 },
        { commands: [['M', 99, 136], ['C', 94, 158, 84, 176, 68, 188]], duration: 0.16 },
        { commands: [['M', 123, 136], ['C', 122, 158, 125, 176, 136, 183], ['C', 147, 190, 160, 183, 169, 169]], duration: 0.18 },
      ],
      [
        { commands: [['M', 78, 40], ['C', 76, 74, 76, 111, 78, 151]], duration: 0.18 },
        { commands: [['M', 78, 91], ['C', 98, 87, 118, 88, 133, 92]], duration: 0.12 },
        { commands: [['M', 18, 169], ['C', 55, 163, 105, 163, 146, 168]], duration: 0.18 },
      ],
      [
        { commands: [['M', 48, 44], ['C', 43, 70, 35, 95, 28, 118], ['C', 24, 131, 31, 138, 43, 143], ['C', 59, 149, 72, 160, 81, 177]], duration: 0.2 },
        { commands: [['M', 77, 75], ['C', 70, 103, 61, 131, 48, 153], ['C', 39, 167, 30, 174, 20, 178]], duration: 0.18 },
        { commands: [['M', 19, 109], ['C', 44, 103, 69, 103, 92, 112]], duration: 0.14 },
        { commands: [['M', 112, 59], ['C', 130, 49, 155, 48, 164, 57], ['C', 174, 67, 164, 77, 151, 86], ['C', 140, 94, 133, 103, 131, 114]], duration: 0.2 },
        { commands: [['M', 143, 90], ['C', 140, 113, 139, 136, 141, 158], ['C', 142, 173, 132, 180, 120, 170]], duration: 0.18 },
        { commands: [['M', 101, 116], ['C', 128, 110, 158, 110, 178, 117]], duration: 0.16 },
      ],
    ],
  }),
]

function getCurrentPeriod() {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 19) return 'afternoon'
  return 'evening'
}

const previousTemplates = { zh: '', en: '' }
function selectTemplate() {
  const language = locale.value
  const storageKey = language === 'en' ? 'knowledge-handwriting-template-en' : 'knowledge-handwriting-template'
  let previousKey = previousTemplates[language]

  try {
    previousKey = window.sessionStorage.getItem(storageKey) || previousKey
  } catch {
    // 存储受限不影响手写提示展示。
  }

  const currentPeriod = getCurrentPeriod()
  const candidates = language === 'en' ? englishHandwritingCandidates({ period: currentPeriod, previousKey, mobile: Boolean(window.matchMedia?.('(max-width: 900px)')?.matches) }) : templates.filter(
    (template) => template.key !== previousKey && (!template.period || template.period === currentPeriod),
  )
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? templates[0]
  previousTemplates[language] = selected.key

  try {
    window.sessionStorage.setItem(storageKey, selected.key)
  } catch {
    // 仅用会话存储避免连续重复，不涉及认证或问答数据。
  }

  return selected
}

const activeTemplate = ref(selectTemplate())
const displayedTemplate = computed(() => activeTemplate.value)
const promptVisible = ref(true)
const renderCycle = ref(0)
let rotationTimer

function getDrawingDuration(template) {
  return Math.max(...template.strokes.map((stroke) => stroke.delay + stroke.duration)) * 1000
}

function scheduleNextTemplate() {
  if (!running.value) return
  const drawingDuration = getDrawingDuration(displayedTemplate.value)

  rotationTimer = window.setTimeout(() => {
    promptVisible.value = false

    rotationTimer = window.setTimeout(() => {
      activeTemplate.value = selectTemplate()
      renderCycle.value += 1
      promptVisible.value = true
      scheduleNextTemplate()
    }, PROMPT_FADE_DURATION)
  }, drawingDuration + PROMPT_HOLD_DURATION)
}

function pause() {
  running.value = false
  window.clearTimeout(rotationTimer)
  rotationTimer = undefined
}
function resume() {
  if (!props.active || reducedMotion.value || deactivated || document.hidden || running.value) return
  running.value = true
  promptVisible.value = true
  scheduleNextTemplate()
}
function syncMotion(event) {
  reducedMotion.value = event.matches
  if (event.matches) { pause(); promptVisible.value = true }
  else resume()
}
function syncVisibility() { if (document.hidden) pause(); else resume() }
watch(() => props.active, value => { if (value) resume(); else pause() })
watch(locale, () => { pause(); activeTemplate.value = selectTemplate(); renderCycle.value += 1; promptVisible.value = true; resume() })
onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotion(motionQuery)
  motionQuery.addEventListener('change', syncMotion)
  document.addEventListener('visibilitychange', syncVisibility)
})
onActivated(() => { deactivated = false; resume() })
onDeactivated(() => { deactivated = true; pause() })
onBeforeUnmount(() => {
  pause()
  motionQuery?.removeEventListener('change', syncMotion)
  document.removeEventListener('visibilitychange', syncVisibility)
})
</script>

<template>
  <div
    class="handwriting-prompt-shell"
    :class="{ 'handwriting-prompt-shell--leaving': !promptVisible, 'is-paused': !running }"
  >
    <svg
      :key="`${displayedTemplate.key}-${renderCycle}`"
      class="handwriting-prompt"
      :viewBox="displayedTemplate.viewBox"
      :style="{ '--prompt-width': displayedTemplate.width, '--prompt-stroke-width': displayedTemplate.strokeWidth, '--prompt-shadow-width': displayedTemplate.shadowWidth }"
      role="img"
      :aria-label="t(displayedTemplate.label)"
    >
      <defs>
        <linearGradient
          :id="gradientId"
          x1="45"
          y1="45"
          :x2="displayedTemplate.gradientEnd ?? 495"
          y2="205"
          gradientUnits="userSpaceOnUse"
        >
          <stop class="handwriting-prompt__color handwriting-prompt__color--one" offset="0" />
          <stop class="handwriting-prompt__color handwriting-prompt__color--two" offset="0.34" />
          <stop class="handwriting-prompt__color handwriting-prompt__color--three" offset="0.68" />
          <stop class="handwriting-prompt__color handwriting-prompt__color--four" offset="1" />
        </linearGradient>
      </defs>

      <g class="handwriting-prompt__shadow" transform="translate(3 4)" aria-hidden="true">
        <path
          v-for="(stroke, index) in displayedTemplate.strokes"
          :key="`shadow-${index}`"
          :d="stroke.d"
          :transform="stroke.transform"
          pathLength="1"
          :stroke="`url(#${gradientId})`"
          :style="{
            '--stroke-delay': `${stroke.delay}s`,
            '--stroke-duration': `${stroke.duration}s`,
          }"
        />
      </g>

      <g class="handwriting-prompt__ink" aria-hidden="true">
        <path
          v-for="(stroke, index) in displayedTemplate.strokes"
          :key="index"
          :d="stroke.d"
          :transform="stroke.transform"
          pathLength="1"
          :stroke="`url(#${gradientId})`"
          :style="{
            '--stroke-delay': `${stroke.delay}s`,
            '--stroke-duration': `${stroke.duration}s`,
          }"
        />
      </g>
    </svg>

    <p
      :key="`hint-${displayedTemplate.key}-${renderCycle}`"
      class="handwriting-prompt__hint"
      :style="{ '--hint-delay': `${getDrawingDuration(displayedTemplate) / 1000 + 0.1}s` }"
    >
      {{ t(displayedTemplate.hint) }}
    </p>
  </div>
</template>

<style scoped>
.handwriting-prompt-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-height: 190px;
  justify-content: center;
  opacity: 1;
  transition: opacity 0.68s cubic-bezier(0.4, 0, 0.2, 1);
}

.handwriting-prompt-shell--leaving {
  opacity: 0;
}

.handwriting-prompt {
  display: block;
  width: min(var(--prompt-width), 90%);
  overflow: visible;
}

.handwriting-prompt path {
  fill: none;
  opacity: 0;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  animation: handwriting-draw var(--stroke-duration) cubic-bezier(0.34, 0.08, 0.22, 1)
    var(--stroke-delay) forwards;
}

.handwriting-prompt__shadow {
  opacity: 0.22;
}

.handwriting-prompt__shadow path {
  stroke-width: var(--prompt-shadow-width, 17px);
}

.handwriting-prompt__ink path {
  stroke-width: var(--prompt-stroke-width, 14px);
}

.handwriting-prompt__hint {
  margin: 10px 0 0;
  color: #929b96;
  font-size: 12px;
  opacity: 0;
  animation: handwriting-hint-appear 0.45s ease-out var(--hint-delay) forwards;
}

.handwriting-prompt__color {
  animation: handwriting-color-flow 12s linear infinite;
}

.handwriting-prompt__color--one {
  stop-color: #438c98;
}

.handwriting-prompt__color--two {
  stop-color: #628e6f;
  animation-delay: -3s;
}

.handwriting-prompt__color--three {
  stop-color: #cb9759;
  animation-delay: -6s;
}

.handwriting-prompt__color--four {
  stop-color: #b66f80;
  animation-delay: -9s;
}

.is-paused :is(path, .handwriting-prompt__color, .handwriting-prompt__hint) { animation-play-state: paused; }

@keyframes handwriting-draw {
  from {
    opacity: 1;
    stroke-dashoffset: 1;
  }

  to {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}

@keyframes handwriting-color-flow {
  0%,
  100% {
    stop-color: #438c98;
  }

  25% {
    stop-color: #628e6f;
  }

  50% {
    stop-color: #cb9759;
  }

  75% {
    stop-color: #b66f80;
  }
}

@keyframes handwriting-hint-appear {
  to {
    opacity: 1;
  }
}

@media (max-width: 720px) {
  .handwriting-prompt {
    width: min(248px, 80%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .handwriting-prompt-shell {
    transition: none;
  }

  .handwriting-prompt path {
    opacity: 1;
    stroke-dashoffset: 0;
    animation: none;
  }

  .handwriting-prompt__color {
    animation: none;
  }

  .handwriting-prompt__hint {
    opacity: 1;
    animation: none;
  }
}
</style>
