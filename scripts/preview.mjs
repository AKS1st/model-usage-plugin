/**
 * 面板预览：把客户端组件在 jsdom 里渲染成一张独立 HTML，并可选调用无头浏览器截图。
 * 用途是设计评审——改布局前先看到真实渲染结果，而不是靠想象。
 *
 * 用法：
 *   node scripts/preview.mjs                 # 生成 .verify-home/preview-{light,dark}.html
 *   node scripts/preview.mjs --shot          # 再用 chrome headless 截图
 *
 * 预览用的是**真实组件**与**真实 CSS**：CSS 取自客户端 apply 注入的 <style>，
 * 主题令牌直接内联 harness 的 design-platform.css，因此配色与线上一致。
 * 不启动、不重启 dsh web，也不写任何真实 profile。
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 版本号取自 package.json，预览里显示的版本不会与真实版本漂移。
const PKG = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'))
const OUT_DIR = join(PLUGIN_ROOT, '.verify-home')
const HARNESS = '/home/zero/AgentX/harness'
const THEME_CSS = join(HARNESS, 'packages/client/ui-theme/src/styles/design-platform.css')
const SHOT = process.argv.includes('--shot')
// 设置面板：800px 面板 − 188px 导航，内容区约 612px。
// --width=NNN 可覆盖（例如 420 模拟侧栏窄栏），用于验证窄宽度下不横向溢出。
const TAB_ARG = (process.argv.find((arg) => arg.startsWith('--tab=')) || '').split('=')[1]
// 产物后缀只在这里定义一次：写入、测量、截图三处共用。
const HOVER_ARG = Number((process.argv.find((arg) => arg.startsWith('--hover=')) || '').split('=')[1])
const HOVER_SCENE = process.argv.some((arg) => arg.startsWith('--hover='))
const WIDTH_ARG = process.argv.find((arg) => arg.startsWith('--width='))
const CONTENT_WIDTH = WIDTH_ARG ? Number(WIDTH_ARG.split('=')[1]) : 612

/**
 * 按平台模块语义 require 一个模块。
 * @param {string} specifier - 模块名。
 * @returns {unknown} 模块导出。
 */
function requirePlatform(specifier) {
  const roots = [
    join(HARNESS, 'package.json'),
    join(HARNESS, 'packages/client/ui-chat/package.json'),
  ]
  for (const root of roots) {
    try { return createRequire(root)(specifier) } catch { /* 试下一个根 */ }
  }
  throw new Error('cannot resolve platform module: ' + specifier)
}

// ---------- 造一份有代表性的数据 ----------

/**
 * 构造快照：一个占绝大多数的廉价模型、两个高价模型、一个无价模型。
 * 刻意让"按 token 占比"和"按费用占比"给出不同的结论——这正是要验证的设计点。
 * @returns {object} 快照。
 */
function makeSnapshot() {
  const flash = {
    currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0,
    peak: { enabled: true, start: '01:00', end: '04:00', timezone: 'UTC', weekdays: [1, 2, 3, 4, 5], input: 2, output: 8, cacheRead: 0.04, cacheWrite: 0 },
    peak2: { enabled: true, start: '06:00', end: '10:00', timezone: 'UTC', weekdays: [1, 2, 3, 4, 5] },
    presetRev: 2,
  }
  const rows = [
    { model: 'deepseek-flash', modelKey: 'deepseek-flash', calls: 4820, failed: 3, inputTokens: 8_200_000, cacheReadTokens: 640_000_000, cacheWriteTokens: 0, outputTokens: 4_100_000, reasoningTokens: 900_000, peakInputTokens: 1_200_000, peakCacheReadTokens: 96_000_000, peakCacheWriteTokens: 0, peakOutputTokens: 600_000, providers: ['deepseek-official'], toolCalls: 7, toolFailed: 0 },
    { model: 'deepseek-v4-flash', modelKey: 'deepseek-flash', calls: 1310, failed: 12, inputTokens: 2_100_000, cacheReadTokens: 180_000_000, cacheWriteTokens: 0, outputTokens: 1_050_000, reasoningTokens: 210_000, peakInputTokens: 320_000, peakCacheReadTokens: 27_000_000, peakCacheWriteTokens: 0, peakOutputTokens: 150_000, providers: ['deepseek-official', 'dashscope'] },
    { model: 'gpt-5.6-sol', modelKey: 'gpt-5.6-sol', calls: 204, failed: 0, inputTokens: 1_575_110, cacheReadTokens: 24_121_984, cacheWriteTokens: 0, outputTokens: 90_524, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, providers: ['openai-codex'], toolCalls: 8, toolFailed: 0 },
    { model: 'gpt-5.6-luna', modelKey: 'gpt-5.6-luna', calls: 6108, failed: 0, inputTokens: 27_895_539, cacheReadTokens: 570_135_296, cacheWriteTokens: 0, outputTokens: 1_274_192, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, providers: ['openai-codex'], toolCalls: 9, toolFailed: 1 },
    { model: 'glm-5.1', modelKey: 'glm-5.1', calls: 774, failed: 0, inputTokens: 2_956_661, cacheReadTokens: 52_774_912, cacheWriteTokens: 0, outputTokens: 266_773, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, providers: ['dashscope'], toolCalls: 10, toolFailed: 0 },
  ]
  const presets = {
    // DeepSeek 没有套餐（只有充值余额）→ 不显示 token plan 勾选框。
    'deepseek-flash': flash,
    // 支持套餐的模型：截图里会多出一个"Token Plan"勾选框。
    'gpt-5.6-sol': { currency: 'USD', input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5, tokenPlanSupported: true },
    'gpt-5.6-luna': { currency: 'USD', input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25, tokenPlanSupported: true },
  }
  // 造 N 个模型（--models=N 为**额外的**辅助模型数，默认 7 → 快照共 11 个模型）：总览必须限高，否则"高度随内容增长"这个缺陷
  // 在 5 个模型下看不出来。
  const extra = Number((process.argv.find((arg) => arg.startsWith('--models=')) || '').split('=')[1])
  const extraCount = Number.isFinite(extra) && extra >= 0 ? extra : 7
  for (let index = 0; index < extraCount; index += 1) {
    const name = 'aux-model-' + String(index + 1).padStart(2, '0')
    rows.push({
      model: name, modelKey: name,
      calls: 400 - index * 45, failed: index % 3,
      inputTokens: 900_000 - index * 90_000, cacheReadTokens: 24_000_000 - index * 2_600_000,
      cacheWriteTokens: 0, outputTokens: 260_000 - index * 26_000, reasoningTokens: 12_000,
      peakInputTokens: 40_000, peakCacheReadTokens: 900_000, peakCacheWriteTokens: 0, peakOutputTokens: 20_000,
      providers: ['dashscope'], toolCalls: 11, toolFailed: 0,
    })
    presets[name] = { currency: 'CNY', input: 1.2 + index * 0.4, output: 4 + index * 1.2, cacheRead: 0.2, cacheWrite: 0 }
  }
  const daysArg = Number((process.argv.find((arg) => arg.startsWith('--days=')) || '').split('=')[1])
  const dayCount = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 45
  const daySeries = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 1) + index * 86_400_000).toISOString().slice(0, 10)
    const wave = 0.55 + 0.45 * Math.sin(index / 3.1)
    const scale = Math.round(wave * 100 + 20)
    return {
      date,
      calls: scale * 7, failed: 0,
      inputTokens: 21_000 * scale, cacheReadTokens: 900_000 * scale, cacheWriteTokens: 0,
      outputTokens: 52_000 * scale, reasoningTokens: 6_000 * scale,
      peakInputTokens: 5_000 * scale, peakCacheReadTokens: 22_000 * scale, peakCacheWriteTokens: 0, peakOutputTokens: 12_000 * scale,
      // 工具指标：随天波动，并让其中一天带上"高频工具"明细。
      toolCalls: 16 + (index % 7) * 4,
      toolFailed: index % 5 === 0 ? 2 : 0,
      tools: index === dayCount - 1 ? { read: 22, edit: 14, bash: 9, grep: 6 } : { read: 12, edit: 6, bash: 3 },
      byModel: {
        'deepseek-flash': { k: 'deepseek-flash', c: scale * 5, i: 16_000 * scale, r: 800_000 * scale, w: 0, o: 40_000 * scale, n: 5_000 * scale, pi: 4_000 * scale, pr: 200_000 * scale, pw: 0, po: 10_000 * scale, tc: 12 + (index % 7) * 4, tf: index % 5 === 0 ? 2 : 0 },
        'gpt-5.6-sol': { k: 'gpt-5.6-sol', c: Math.max(1, Math.round(scale / 20)), i: 3_000 * scale, r: 60_000 * scale, w: 0, o: 8_000 * scale, n: 0, pi: 0, pr: 0, pw: 0, po: 0, tc: 4, tf: 0 },
        'gpt-5.6-luna': { k: 'gpt-5.6-luna', c: scale, i: 2_000 * scale, r: 40_000 * scale, w: 0, o: 4_000 * scale, n: 0, pi: 0, pr: 0, pw: 0, po: 0, tc: 2, tf: 0 },
      },
    }
  })
  const hourSeries = Array.from({ length: 12 }, (_, index) => ({
    date: '2026-09-10T' + String(8 + index).padStart(2, '0'),
    calls: 40 + index * 6, failed: 0,
    inputTokens: 80_000, cacheReadTokens: 3_200_000, cacheWriteTokens: 0, outputTokens: 210_000, reasoningTokens: 0,
    peakInputTokens: 20_000, peakCacheReadTokens: 900_000, peakCacheWriteTokens: 0, peakOutputTokens: 60_000,
    byModel: { 'deepseek-flash': { k: 'deepseek-flash', c: 40 + index * 6, i: 80_000, r: 3_200_000, w: 0, o: 210_000, n: 0, pi: 20_000, pr: 900_000, pw: 0, po: 60_000 } },
  }))
  // 热力图日账：371 天，只给有活动的日子（缺席即 0），并让强度有明显起伏。
  const heatSeries = []
  const heatToday = new Date()
  heatToday.setHours(0, 0, 0, 0)
  for (let back = 0; back < 371; back += 1) {
    const day = new Date(heatToday)
    day.setDate(day.getDate() - back)
    const weekday = day.getDay()
    // 周末少干活；再叠一层周期，制造可见的深浅分布。
    const base = weekday === 0 || weekday === 6 ? 0.25 : 1
    const wave = 0.35 + 0.65 * Math.abs(Math.sin(back / 5.7))
    const intensity = base * wave
    if (intensity < 0.18) continue
    heatSeries.push({
      d: day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0'),
      t: Math.round(120_000 * intensity),
      k: Math.round(9 * intensity),
    })
  }
  heatSeries.reverse()
  // --empty-heat：模拟"刚装好、账还是空的"场景，核对空态布局。
  if (process.argv.includes('--empty-heat')) heatSeries.length = 0
  return {
    rows,
    prices: Object.fromEntries(Object.entries(presets).concat([
      ['glm-5.1', { currency: 'CNY', input: 4.29, output: 15.73, cacheRead: 0.79, cacheWrite: 0, customPricing: true }],
      ['gpt-5.6-luna', { ...presets['gpt-5.6-luna'], tokenPlan: true }],
    ])),
    presets,
    daySeries,
    hourSeries,
    heatSeries,
    pluginVersion: PKG.version,
    rates: { USD: 1, CNY: 7.15, EUR: 0.92 },
    ratesSource: 'live',
    ratesUpdatedAt: '2026-09-10T00:00:00Z',
    ratesFetchedAt: new Date().toISOString(),
    targetCurrency: 'CNY',
    balance: { status: 'ok', total: 412.66, currency: 'CNY', infos: [{ currency: 'CNY', total: 412.66, granted: 0, toppedUp: 412.66 }], updatedAt: '2026-09-10T00:00:00Z', message: null },
  }
}

// ---------- 渲染 ----------

/**
 * 渲染面板，返回 markup 与组件注入的 CSS。
 * @param {object} snapshot - 快照数据。
 * @returns {Promise<{markup: string, css: string}>} 渲染结果。
 */
/**
 * 渲染面板。
 * @param {object} snapshot - 快照数据。
 * @param {{tab?: string, hover?: number}} [scene] - 场景：子页面与要悬停的柱序号。
 * @returns {Promise<{markup: string, css: string}>} markup 与注入的 CSS。
 */
async function renderPanel(snapshot, scene = {}) {
  const { JSDOM } = requirePlatform('jsdom')
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:3080/',
  })
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle']) {
    globalThis[key] = dom.window[key]
  }
  // jsdom 没有排版引擎：图表按容器宽度决定柱数与柱宽，这里给出贴近真实的绘图区宽度
  // （内容区减去卡片左右内边距），否则生成的 markup 会按退回值算偏宽的柱子。
  const tab = scene.tab || 'overview'
  const hoverArg = scene.hover
  const drawingWidth = CONTENT_WIDTH - 22
  dom.window.Element.prototype.getBoundingClientRect = function rect() {
    return { x: 0, y: 0, top: 0, left: 0, right: drawingWidth, bottom: 0, width: drawingWidth, height: 0, toJSON() {} }
  }
  const savedObserver = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback }
    observe(target) { this.callback([{ target }], this) }
    unobserve() {}
    disconnect() {}
  }
  const restoreObserver = () => {
    if (savedObserver === undefined) delete globalThis.ResizeObserver
    else globalThis.ResizeObserver = savedObserver
  }
  dom.window.__ModuleLoader__ = { load(definition) { globalThis.__captured = definition } }
  const React = requirePlatform('react')
  const { createRoot } = requirePlatform('react-dom/client')

  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/client.js')).href + '?preview=1')
  const plugin = globalThis.__captured.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error('unexpected require: ' + specifier)
  })

  let captured = null
  const dictionaries = new Map()
  plugin.apply({
    on: () => () => {},
    interval: () => () => {},
    effect: (fn) => { fn(); return () => {} },
    get: (name) => {
      if (name === 'slots') {
        return {
          inject: (_slot, register) => { register() },
          register: (options, component) => { captured = { options, component }; return () => {} },
        }
      }
      if (name === 'locale') {
        return {
          register: (ns, lang, dict) => { dictionaries.set(ns + ':' + lang, dict); return () => {} },
          bind: (ns) => (key) => (dictionaries.get(ns + ':zh') || {})[key] || key,
        }
      }
      return undefined
    },
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = (url, options) => {
    if (options && options.method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) })
  }
  const container = dom.window.document.getElementById('root')
  const root = createRoot(container)
  const act = React.act || (async (fn) => { await fn() })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => { root.render(React.createElement(captured.component, { t: (key) => key })) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
  globalThis.fetch = originalFetch
  // tab=models|config：先点开对应子页面再抓 markup，否则只能看到总览。
  if (tab !== 'overview') {
    const labels = { models: 'tabModels', config: 'tabConfig' }
    const target = [...container.querySelectorAll('.mu-tab')].find((node) => labels[tab] && node.textContent.includes(labels[tab]))
    if (target) {
      await act(async () => {
        target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      })
    } else {
      console.log('未找到标签页: ' + tab)
    }
  }
  // hover=N：模拟悬停第 N 根柱，使浮窗出现在产物里——否则浮窗永远不会被真实排版
  // 检查覆盖，而"浮层越出图表"正是曾经两次流到线上的缺陷。
  if (Number.isFinite(hoverArg) && hoverArg >= 0) {
    const cols = container.querySelectorAll('.mu-chart-col')
    const target = cols[Math.min(hoverArg, cols.length - 1)]
    if (target) {
      await act(async () => {
        // React 17+ 用 mouseover/mouseout 实现 onMouseEnter/Leave。
        target.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, relatedTarget: null }))
      })
    } else {
      console.log('未找到可悬停的柱')
    }
  }
  const markup = container.innerHTML
  // 组件在 apply 里把面板 CSS 注入到 head。
  const styles = Array.from(dom.window.document.head.querySelectorAll('style')).map((el) => el.textContent).join('\n')
  root.unmount()
  restoreObserver()
  dom.window.close()
  return { markup, css: styles }
}

// ---------- 输出 ----------

/**
 * 组装独立 HTML：内联真实主题令牌与面板 CSS。
 * @param {string} markup - 面板 markup。
 * @param {string} css - 面板 CSS。
 * @param {'light'|'dark'} scheme - 主题。
 * @returns {string} 完整 HTML。
 */
function composeHtml(markup, css, scheme) {
  const theme = existsSync(THEME_CSS) ? readFileSync(THEME_CSS, 'utf8') : ''
  return `<!doctype html>
<html data-theme="${scheme}" style="color-scheme:${scheme}">
<head>
<meta charset="utf-8">
<style>
${theme}
html, body { margin: 0; padding: 0; background: var(--dsw-alias-bg-base); }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
.preview-shell { padding: 16px; }
.preview-content { width: ${CONTENT_WIDTH}px; margin: 0 auto; }
.preview-note { width: ${CONTENT_WIDTH}px; margin: 0 auto 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-family: ui-monospace, monospace; }
</style>
<style id="panel-css">
${css}
</style>
<style>
/* 深色预览：把 design-platform 里的 dark 覆盖值提上来（该文件用媒体查询/选择器分段）。 */
${scheme === 'dark' ? `
[data-theme="dark"] {
  --dsw-alias-bg-base: var(--dsw-static-neutral-bluish-950);
  --dsw-alias-bg-layer-1: var(--dsw-static-neutral-bluish-875);
  --dsw-alias-bg-layer-2: var(--dsw-static-neutral-bluish-850);
  --dsw-alias-bg-overlay: var(--dsw-static-neutral-bluish-700);
  --dsw-alias-border-l1: rgba(255,255,255,0.06);
  --dsw-alias-border-l2: rgba(255,255,255,0.12);
  --dsw-alias-brand-primary: var(--dsw-static-neutral-bluish-50);
  --dsw-alias-label-primary: var(--dsw-static-neutral-bluish-50);
  --dsw-alias-label-secondary: var(--dsw-static-neutral-bluish-300);
  --dsw-alias-label-tertiary: var(--dsw-static-neutral-bluish-400);
  --dsw-alias-label-quaternary: var(--dsw-static-neutral-bluish-500);
}
` : ''}
</style>
</head>
<body>
<div class="preview-shell">
  <div class="preview-note">设置面板内容区宽度 ${CONTENT_WIDTH}px · ${scheme} · 真实组件 + 真实 CSS</div>
  <div class="preview-content">${markup}</div>
</div>
<script>
// 真实布局测量：用浏览器自己的排版结果回答"页面有多高、哪一块最大、有没有横向溢出"。
// 结果写进 DOM，配合 chrome --dump-dom 在无头环境里读回。
(function () {
  var LABELS = {
    'mu-chart-card': '趋势卡', 'mu-share-card': '占比卡', 'mu-heat-card': '热力图卡', 'mu-big': '关键数字', 'mu-eff': '效率卡', 'mu-list': '模型列表',
    'mu-subline': '次要计数', 'mu-list': '模型列表', 'mu-config': '配置折叠',
    'mu-head': '标题', 'mu-cur': '货币行', 'mu-bconf': '余额配置', 'mu-add': '添加模型',
  };
  function heightOf(el) { return Math.round(el.getBoundingClientRect().height); }
  var page = document.querySelector('.mu-page');
  var details = document.querySelector('.mu-config');
  var report = {
    totalHeight: page ? Math.round(page.getBoundingClientRect().height) : 0,
    // 整页高度（含预览页自身的留白）：截图按它设窗口高度，才不会拍进一大片空白。
    bodyHeight: Math.round(document.body.getBoundingClientRect().height),
    detailsOpen: details ? details.hasAttribute('open') : null,
    configVisible: details ? Math.round(details.getBoundingClientRect().height) : 0,
    blocks: [], overflow: [], widest: 0,
    bars: 0, barWidth: 0,
  };
  // 柱数与柱宽：用于回答"会不会随时间长得很密"。
  var cols = document.querySelectorAll('.mu-chart-col');
  var firstBar = document.querySelector('.mu-chart-stack');
  report.bars = cols.length;
  report.barWidth = firstBar ? Math.round(firstBar.getBoundingClientRect().width * 10) / 10 : 0;
  // 柱群实际占用的横向范围 vs 绘图区宽度：两者不等即说明柱子是定宽靠左排列，
  // 而不是被拉伸去均分整行。
  var barsArea = document.querySelector('.mu-chart-bars');
  if (barsArea && cols.length > 0) {
    var area = barsArea.getBoundingClientRect();
    var firstCol = cols[0].getBoundingClientRect();
    var lastCol = cols[cols.length - 1].getBoundingClientRect();
    report.barsExtent = Math.round(lastCol.right - firstCol.left);
    report.plotWidth = Math.round(area.width);
  }
  Object.keys(LABELS).forEach(function (cls) {
    var nodes = document.querySelectorAll('.' + cls);
    if (nodes.length === 0) return;
    var sum = 0;
    for (var i = 0; i < nodes.length; i++) sum += heightOf(nodes[i]);
    report.blocks.push({ cls: cls, label: LABELS[cls], count: nodes.length, height: sum });
  });
  report.blocks.sort(function (a, b) { return b.height - a.height; });
  // 横向溢出：任何元素右边界超出内容区右边界即为潜在错位。
  var content = document.querySelector('.preview-content');
  var right = content ? content.getBoundingClientRect().right : 0;
  var all = document.querySelectorAll('.preview-content *');
  for (var k = 0; k < all.length; k++) {
    var box = all[k].getBoundingClientRect();
    if (box.width === 0) continue;
    if (box.right > right + 0.5) {
      report.overflow.push({ cls: all[k].className || all[k].tagName, over: Math.round(box.right - right) });
    }
    if (box.right > report.widest) report.widest = Math.round(box.right);
  }
  report.overflow = report.overflow.slice(0, 8);
  // 纵向包含：容器的子元素不得越出容器上下边界。
  // 曾经漏掉这个方向——柱高是 132px 而柱区只有 86px，柱子向上戳出图表，
  // 而只比左右边界的检查报了"无溢出"。
  report.escape = [];
  // 固定定位元素（悬停气泡）**允许**越出容器——那是气泡的常态。它另有约束：
  // 必须留在视口内，见下面的 viewportEscape。
  function isFixed(node) {
    var cur = node;
    while (cur && cur.nodeType === 1) {
      if (window.getComputedStyle(cur).position === 'fixed') return true;
      cur = cur.parentElement;
    }
    return false;
  }
  var CONTAINERS = ['.mu-chart-bars', '.mu-chart-info', '.mu-share-card', '.mu-eff', '.mu-big', '.mu-chart-card'];
  CONTAINERS.forEach(function (selector) {
    var boxes = document.querySelectorAll(selector);
    for (var b = 0; b < boxes.length; b++) {
      var outer = boxes[b].getBoundingClientRect();
      var kids = boxes[b].querySelectorAll('*');
      for (var k = 0; k < kids.length; k++) {
        var inner = kids[k].getBoundingClientRect();
        if (inner.width === 0 && inner.height === 0) continue;
        if (isFixed(kids[k])) continue;
        var overTop = Math.round(outer.top - inner.top);
        var overBottom = Math.round(inner.bottom - outer.bottom);
        if (overTop > 1 || overBottom > 1) {
          report.escape.push({
            container: selector,
            node: kids[k].className || kids[k].tagName,
            overTop: overTop > 1 ? overTop : 0,
            overBottom: overBottom > 1 ? overBottom : 0,
          });
        }
      }
    }
  });
  report.escape = report.escape.slice(0, 8);
  // 固定定位气泡的约束是"留在视口内"，而不是"留在容器内"。
  report.viewportEscape = [];
  var fixedNodes = document.querySelectorAll('.mu-chart-tip');
  report.tipFound = fixedNodes.length;
  for (var f = 0; f < fixedNodes.length; f++) {
    var tipBox = fixedNodes[f].getBoundingClientRect();
    var overLeft = Math.round(-tipBox.left);
    var overRight = Math.round(tipBox.right - window.innerWidth);
    var overTop = Math.round(-tipBox.top);
    var overBottom = Math.round(tipBox.bottom - window.innerHeight);
    if (overLeft > 1 || overRight > 1 || overTop > 1 || overBottom > 1) {
      report.viewportEscape.push({
        overLeft: Math.max(0, overLeft), overRight: Math.max(0, overRight),
        overTop: Math.max(0, overTop), overBottom: Math.max(0, overBottom),
      });
    }
  }
  var pre = document.createElement('pre');
  pre.id = 'layout-report';
  pre.textContent = JSON.stringify(report);
  document.body.appendChild(pre);
})();
</script>
</body>
</html>`
}

mkdirSync(OUT_DIR, { recursive: true })
const snapshot = makeSnapshot()

/**
 * 产物文件名后缀：**写入、测量、截图三处共用这一个规则**。
 *
 * 这里踩过两次同一个坑：写入与读取用不同的后缀拼法，于是测量/截图读到的是上一轮的
 * 旧文件——看起来在验当前代码，其实在验历史产物（比没有验证更危险）。
 * 悬停场景也因此单独成文件：浮窗只在悬停时存在，不能和默认态共用一份产物。
 * @param {string} tab - 子页面（overview / models / config）。
 * @returns {string} 文件名后缀。
 */
const suffixOf = (tab) => (tab && tab !== 'overview' ? '-' + tab : '') + (HOVER_SCENE ? '-hover' : '')

/**
 * 渲染一个子页面并写出 light / dark 两份 HTML。
 * @param {string} tab - 子页面（overview / models / config）。
 * @returns {Promise<{markup: string, css: string, files: string[]}>} 渲染结果与产物路径。
 */
async function emitHtml(tab) {
  const { markup, css } = await renderPanel(snapshot, { tab, hover: HOVER_ARG })
  const files = []
  for (const scheme of ['light', 'dark']) {
    const file = join(OUT_DIR, 'preview-' + scheme + suffixOf(tab) + '.html')
    writeFileSync(file, composeHtml(markup, css, scheme))
    files.push(file)
  }
  return { markup, css, files }
}

const { markup, css, files: outputs } = await emitHtml(TAB_ARG || 'overview')
for (const file of outputs) console.log('written', file)
// 便于 diff 的结构摘要：顶层块级元素顺序。
const blocks = [...markup.matchAll(/class="(mu-[a-z-]+)[^"]*"/g)].map((match) => match[1])
const order = []
for (const name of blocks) if (order[order.length - 1] !== name) order.push(name)
console.log('\n顶层结构顺序：')
console.log('  ' + order.slice(0, 24).join(' → '))
console.log('\nmarkup 大小：', (markup.length / 1024).toFixed(1), 'KB | CSS：', (css.length / 1024).toFixed(1), 'KB')

// 截图/测量都要带上子页面后缀，否则只会读到总览那一份。

/**
 * 用真实浏览器量一个产物的布局，读回页面里写好的报告。
 * @param {string} html - 产物路径。
 * @param {number} [viewportHeight] - 测量时用的视口高度。
 * @returns {object|null} 报告对象；浏览器不可用或读不到时为 null。
 */
function browserReport(html, viewportHeight = 3000) {
  const result = spawnSync('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--window-size=' + (CONTENT_WIDTH + 40) + ',' + viewportHeight,
    '--virtual-time-budget=2000',
    '--dump-dom', pathToFileURL(html).href,
  ], { encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024 })
  const match = (result.stdout || '').match(/<pre id="layout-report">([\s\S]*?)<\/pre>/)
  // 排查用：MU_DEBUG_REPORT=1 时打印浏览器真实返回，否则"读不到报告"无法定位。
  if (process.env.MU_DEBUG_REPORT) {
    console.error('[report] status=' + result.status
      + ' error=' + (result.error ? result.error.message : '-')
      + ' stdout=' + (result.stdout || '').length + 'B '
      + 'stderr=' + (result.stderr || '').split('\n').slice(0, 2).join(' | '))
  }
  if (!match) return null
  return JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
}

if (process.argv.includes('--measure')) {
  for (const scheme of ['light']) {
    const html = join(OUT_DIR, 'preview-' + scheme + suffixOf(TAB_ARG || 'overview') + '.html')
    const report = browserReport(html)
    if (report === null) {
      console.log('measure failed: 读不到布局报告（google-chrome 不可用？）')
    } else {
      console.log('\n=== 布局测量（' + CONTENT_WIDTH + 'px 内容区）===')
      console.log('页面总高：' + report.totalHeight + 'px')
      console.log('配置区：' + (report.detailsOpen ? '展开' : '已收起') + '（占 ' + report.configVisible + 'px）')
      console.log('柱数：' + report.bars + ' | 单柱宽：' + report.barWidth + 'px'
        + (report.barsExtent !== undefined ? ' | 柱群占用 ' + report.barsExtent + 'px / 绘图区 ' + report.plotWidth + 'px' : ''))
      // 醒目提示：preview 的 markup 是在 jsdom 里生成的，而 jsdom 没有 ResizeObserver，
      // 所以这里量到的柱数永远是上限（30）。真实浏览器里柱数会按容器宽度自适应，
      // 由 tests/panel.test.mjs 用 stub 覆盖——不要用这里的柱数推断线上密度。
      console.log('注意：柱数为 jsdom 下的上限值；线上的宽度自适应由 tests/panel.test.mjs 验证')
      console.log('\n区块高度（按占比降序）：')
      for (const block of report.blocks) {
        const pct = report.totalHeight > 0 ? Math.round(block.height / report.totalHeight * 100) : 0
        console.log('  ' + String(block.height).padStart(5) + 'px  ' + String(pct).padStart(3) + '%  ' + block.label + (block.count > 1 ? ' ×' + block.count : ''))
      }
      if (report.escape.length > 0) {
        console.log('\n纵向越界（子元素戳出容器）：')
        for (const item of report.escape) {
          console.log('  ' + item.node + ' 越出 ' + item.container
            + (item.overTop ? ' 上边界 ' + item.overTop + 'px' : '')
            + (item.overBottom ? ' 下边界 ' + item.overBottom + 'px' : ''))
        }
      } else {
        console.log('\n纵向越界：无')
      }
      if (report.tipFound === 0) {
        console.log('\n悬停气泡：本场景未展开')
      } else if (report.viewportEscape.length > 0) {
        console.log('\n悬停气泡越出视口：' + JSON.stringify(report.viewportEscape.slice(0, 3)))
      } else {
        console.log('\n悬停气泡：' + report.tipFound + ' 个，均只在视口内越出图表（这是气泡的正常行为）')
      }
      if (report.overflow.length > 0) {
        console.log('\n横向溢出（需要收紧）：')
        for (const item of report.overflow) console.log('  +' + item.over + 'px  ' + item.cls)
      } else {
        console.log('\n横向溢出：无')
      }
    }
  }
}

if (SHOT) {
  const sizes = { desktop: CONTENT_WIDTH + 40, narrow: 420 }
  // 一次出齐三个子页面，否则评审时只能看到总览。
  const shotTabs = TAB_ARG ? [TAB_ARG] : ['overview', 'models', 'config']
  for (const shotTab of shotTabs) {
    // 关键：每个子页面都**重新渲染**自己的 HTML，而不是拿 .verify-home 里的旧文件拍照。
    // 曾经因为 `if (!existsSync(html)) continue` 跳过了重渲染，配置页截图用的是几十分钟前
    // 的产物——截图看起来"新"，内容却是旧代码，比没有截图更糟。
    await emitHtml(shotTab)
  }
  for (const scheme of ['light', 'dark']) {
    for (const [label, width] of Object.entries(sizes)) {
      for (const shotTab of shotTabs) {
      const shotSuffix = suffixOf(shotTab)
      const html = join(OUT_DIR, 'preview-' + scheme + shotSuffix + '.html')
      const png = join(OUT_DIR, 'preview-' + scheme + shotSuffix + '-' + label + '.png')
      if (!existsSync(html)) continue
      // 窗口高度按整页实际高度给：固定 1400 会在内容下面拍进一大片空白，
      // 贴进 README 后既难看又让人以为布局坏了。
      const measured = browserReport(html)
      const height = Math.max(measured && measured.bodyHeight ? measured.bodyHeight + 2 : 1400, 240)
      const result = spawnSync('google-chrome', [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=' + width + ',' + height,
        '--screenshot=' + png,
        '--virtual-time-budget=1500',
        pathToFileURL(html).href,
      ], { encoding: 'utf8', timeout: 60_000 })
      if (existsSync(png)) console.log('shot', png)
      else console.log('shot failed', scheme, label, shotTab, (result.stderr || '').split('\n').slice(0, 3).join(' | '))
      }
    }
  }
}
