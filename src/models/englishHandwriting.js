// 单线手写字形，不依赖字体下载；每个字母沿真实路径书写。
const letters = {
  a: [26, ['M24 54 C8 42 0 67 9 78 C20 88 28 58 23 53 L21 76 Q23 84 30 76']],
  b: [26, ['M5 78 C7 54 21 14 14 22 C4 35 0 68 8 78 C19 90 33 65 23 54 C17 47 8 59 9 69']],
  c: [23, ['M23 56 C9 43 -1 67 8 77 Q16 84 27 73']],
  d: [27, ['M23 55 C8 44 0 65 7 76 C18 89 28 59 23 54 M23 75 C27 53 37 16 30 22 C21 32 17 71 24 79 Q28 81 32 75']],
  e: [23, ['M4 66 C31 63 22 44 10 54 C-4 67 4 87 27 73']],
  f: [19, ['M5 102 C11 79 25 19 17 22 C4 26 6 65 20 76', 'M0 57 Q12 53 24 54']],
  g: [27, ['M24 55 C11 43 0 66 8 77 C19 88 28 59 24 53 C24 80 21 114 7 111 C-8 107 22 86 33 75']],
  h: [27, ['M3 79 C9 55 24 14 16 22 C4 34 3 64 4 77 C15 49 30 47 25 66 C21 83 23 83 33 75']],
  i: [13, ['M8 55 L4 74 Q5 85 17 75', 'M11 40 L11 41']],
  j: [14, ['M12 55 C7 79 9 107 -2 111 C-12 112 -5 95 17 78', 'M15 40 L15 41']],
  k: [27, ['M4 79 C9 55 24 16 17 22 C5 35 4 62 4 77', 'M27 53 Q10 65 7 65 Q17 65 22 77 Q25 82 32 75']],
  l: [15, ['M5 69 C24 42 24 12 14 24 C3 38 -2 80 10 80 Q15 80 20 75']],
  m: [36, ['M4 55 L1 79 C11 50 22 49 17 66 L14 79 C25 49 37 49 32 68 Q27 86 41 75']],
  n: [27, ['M5 55 L1 79 C13 48 29 48 24 68 Q20 85 33 75']],
  o: [26, ['M18 53 C2 49 -1 72 9 79 C22 87 32 59 21 54 C13 51 17 69 31 64']],
  p: [27, ['M8 55 L-3 108', 'M5 74 C13 46 30 46 26 65 C22 84 9 82 8 74 Q20 84 33 74']],
  q: [27, ['M24 54 C8 44 0 68 8 77 C20 88 29 58 24 54 L17 108', 'M20 91 Q27 84 33 82']],
  r: [21, ['M4 79 L11 54 Q7 66 20 54 Q15 66 23 69 L28 65']],
  s: [23, ['M22 54 C13 49 5 58 13 65 C33 81 7 88 3 75 Q6 69 13 73']],
  t: [19, ['M15 35 L5 72 Q3 87 24 75', 'M1 55 Q11 52 24 53']],
  u: [27, ['M7 54 C-6 86 10 90 24 55 L20 75 Q23 84 33 75']],
  v: [25, ['M4 55 Q1 98 22 63 Q28 48 21 55 Q20 65 31 62']],
  w: [36, ['M5 55 C-5 90 13 89 21 56 C10 91 29 92 35 57 Q35 66 43 62']],
  x: [25, ['M4 56 Q17 59 21 77 Q25 82 31 76', 'M25 54 Q12 72 1 80']],
  y: [27, ['M6 55 C-4 83 12 88 25 56 C23 79 16 111 4 110 C-9 108 20 87 33 75']],
  z: [24, ['M4 56 Q16 51 25 55 L5 78 Q20 70 25 78 C36 93 7 120 0 108 Q-5 99 29 84']],
  H: [38, ['M9 30 Q6 56 2 80', 'M39 29 Q27 54 26 79', 'M2 58 Q22 50 36 53']],
  G: [37, ['M37 35 C17 15 -6 58 7 77 C22 95 41 63 32 59 L20 61']],
  W: [46, ['M6 31 Q-2 101 24 40 Q12 102 43 35']],
  L: [31, ['M23 29 C10 28 16 63 5 76 Q-7 84 3 79 Q19 68 33 79']],
  S: [34, ['M34 35 C12 14 0 47 21 53 C48 61 24 92 3 76']],
  F: [31, ['M11 80 Q14 51 24 29', 'M4 35 Q20 26 38 32', 'M10 57 Q20 52 32 55']],
  A: [39, ['M0 81 Q20 50 35 28 Q26 55 28 80', 'M9 64 Q23 57 39 60']],
  I: [22, ['M6 33 Q19 29 30 31', 'M20 33 L8 78', 'M0 81 Q14 76 25 78']],
  '?': [23, ['M1 40 C14 22 35 35 21 49 Q11 57 11 66', 'M10 80 L10 81']],
  '’': [9, ['M8 35 Q10 40 3 47']],
}

const copy = [
  ['hello-there', 'Hello there', 'A good place to begin.'],
  ['good-to-see-you', 'Good to see you', 'Pick up a thought, or start somewhere new.'],
  ['on-your-mind', 'What’s on your mind?', 'Bring a question. We’ll take it from there.'],
  ['where-to-start', 'Where shall we start?', 'Every exploration begins somewhere.'],
  ['lets-explore', 'Let’s explore', 'Start with a question. See where it takes you.'],
  ['stay-curious', 'Stay curious', 'There’s always another angle to discover.'],
  ['follow-that-thought', 'Follow that thought', 'Give an idea a little room to grow.'],
  ['little-curiosity', 'A little curiosity', 'A small question can open up new possibilities.'],
  ['ideas-start-here', 'Ideas start here', 'Turn a passing thought into something useful.'],
  ['think-it-through', 'Let’s think it through', 'We can work through it, one question at a time.'],
  ['good-morning', 'Good morning', 'A fresh start. What would you like to explore?', 'morning'],
  ['good-afternoon', 'Good afternoon', 'What’s worth a closer look today?', 'afternoon'],
  ['good-evening', 'Good evening', 'Take a moment to follow your curiosity.', 'evening'],
]

function createTemplate([key, label, hint, period]) {
  let x = 12, delay = .08
  const strokes = []
  for (const character of label) {
    if (character === ' ') { x += 16; continue }
    const glyph = letters[character]
    if (!glyph) throw new Error(`Missing handwriting glyph: ${character}`)
    for (const d of glyph[1]) {
      const duration = d.length < 30 ? .065 : .14
      strokes.push({ d, transform: `translate(${x} 0)`, delay, duration })
      delay += duration + .012
    }
    x += glyph[0]
  }
  return { key: `en-${key}`, label, hint, period, strokes, viewBox: `-4 12 ${x + 20} 114`, width: `${Math.min(520, Math.max(280, x))}px`, gradientEnd: x, strokeWidth: 5, shadowWidth: 8 }
}

export const englishHandwritingTemplates = copy.map(createTemplate)

export function englishHandwritingCandidates({ period, mobile = false, previousKey = '' }) {
  return englishHandwritingTemplates.filter(template => template.key !== previousKey && (!template.period || template.period === period) && (!mobile || template.label.length <= 14))
}
