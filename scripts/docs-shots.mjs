/**
 * 生成 README 用的截图（docs/*.png）。
 *
 * 为什么要有这个脚本，而不是手动 cp：
 *   1. README 里的截图必须来自**当前代码**。手抄的 cp 命令会漏掉某个子页面，
 *      于是 README 里长期挂着一张旧 UI 的图，谁也没发现（本项目就发生过）。
 *   2. 布局改过之后，旧截图必须消失，否则读者看到的是已经不存在的界面。
 *      所以这里同时做**清理**：docs/ 下不在清单里的图片一律删除。
 *   3. 截图文件名要稳定（docs/overview-light.png），不能带日期或版本号——
 *      否则每次发布都新增一张，仓库里堆的其实是同一张图的历史。
 *
 * 用法：npm run shots:docs
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(PLUGIN_ROOT, '.verify-home')
const DOCS_DIR = join(PLUGIN_ROOT, 'docs')

/** README 引用的截图清单：产物名 → docs 下的稳定名。 */
const SHOTS = {
  'preview-light-desktop.png': 'overview-light.png',
  'preview-dark-desktop.png': 'overview-dark.png',
  'preview-light-models-desktop.png': 'models-light.png',
  'preview-light-config-desktop.png': 'config-light.png',
}

// 1) 先让 preview 重新渲染并截图（preview 的 --shot 会为每个子页面重渲染，见其中的注释）。
const shot = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'scripts/preview.mjs'), '--shot'], {
  cwd: PLUGIN_ROOT,
  stdio: 'inherit',
  timeout: 600_000,
})
if (shot.status !== 0) {
  console.error('preview --shot 失败（退出码 ' + shot.status + '），不更新 docs 截图')
  process.exit(1)
}

// 2) 拷贝到 docs/，缺失即失败——宁可报错也不要留下坏引用。
mkdirSync(DOCS_DIR, { recursive: true })
const missing = []
for (const [from, to] of Object.entries(SHOTS)) {
  const source = join(OUT_DIR, from)
  if (!existsSync(source)) { missing.push(from); continue }
  copyFileSync(source, join(DOCS_DIR, to))
  console.log('  ' + to + '  ←  .verify-home/' + from + '  (' + Math.round(statSync(source).size / 1024) + ' KB)')
}
if (missing.length > 0) {
  console.error('缺少预览产物：' + missing.join(', ') + '（未完成安装，docs 截图可能不完整）')
  process.exit(1)
}

// 3) 清理陈旧截图：docs/ 下不在清单里的图片删除，避免"过时的图继续被引用/被误看"。
const keep = new Set(Object.values(SHOTS))
let removed = 0
for (const name of readdirSync(DOCS_DIR)) {
  if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) continue
  if (keep.has(name)) continue
  rmSync(join(DOCS_DIR, name))
  console.log('  已删除陈旧截图 docs/' + name)
  removed += 1
}
console.log('docs 截图已更新：' + keep.size + ' 张，清理陈旧 ' + removed + ' 张')
