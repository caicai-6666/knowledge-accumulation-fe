import { transformWithOxc } from 'vite'

export const browserTarget = 'chrome80'

// Vite 默认不会降级普通 JS；Vue 编译出的 JS 也需要在开发模式下统一转换。
export function browserCompatibility() {
  let sourceDirectory
  return {
    name: 'knowledge-browser-compatibility',
    apply: 'serve',
    enforce: 'post',
    configResolved(config) { sourceDirectory = `${config.root}/src/` },
    async transform(code, id) {
      const filename = id.split('?')[0]
      if (!filename.startsWith(sourceDirectory) || !/\.(?:vue|m?js)$/.test(filename) || /[?&]type=style(?:&|$)/.test(id)) return null
      return transformWithOxc(code, filename, { lang: 'js', target: browserTarget, sourcemap: true })
    },
  }
}
