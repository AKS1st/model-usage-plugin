import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname
const PKG = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'))

// React 是 shell 提供的平台模块，按线上实际的解析根去找。
const PLATFORM_ROOTS = [
  join(process.env.DSH_HOME || (process.env.HOME || '') + '/.dsh', 'profiles/web/package.json'),
  join(PLUGIN_ROOT, 'package.json'),
  '/home/zero/AgentX/harness/package.json',
  '/home/zero/AgentX/harness/packages/client/ui-chat/package.json',
]

/**
 * 按平台模块语义 require 一个模块。
 * @param {string} specifier - 模块名。
 * @returns {unknown} 模块导出。
 */
function requirePlatform(specifier) {
  for (const root of PLATFORM_ROOTS) {
    try { return createRequire(root)(specifier) } catch { /* 试下一个根 */ }
  }
  throw new Error('cannot resolve platform module: ' + specifier)
}

/**
 * 构造 N 个模型的快照，用于验证总览限高与明细页完整渲染。
 * @param {number} count - 模型数量。
 * @returns {object} 快照。
 */
function makeSnapshot(count) {
  const rows = []
  const presets = {}
  for (let index = 0; index < count; index += 1) {
    const name = 'm-' + String(index + 1).padStart(2, '0')
    rows.push({
      model: name, modelKey: name,
      calls: 100 - index * 2, failed: 0,
      inputTokens: 200_000, cacheReadTokens: 9_000_000, cacheWriteTokens: 0,
      outputTokens: 50_000, reasoningTokens: 0,
      peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0,
      // 单价递减 → 费用递减，排序结果稳定可预期。
      providers: ['test-provider'],
    })
    presets[name] = { currency: 'CNY', input: 10 - index * 0.4, output: 30 - index, cacheRead: 0.5, cacheWrite: 0 }
  }
  // 时间序列与工具计数：趋势卡（柱区）与效率卡都依赖它们。留一个纯空数据的对照
  // 用例另行覆盖"无数据时不渲染空壳"。
  const daySeries = Array.from({ length: 12 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, 1) + index * 86_400_000).toISOString().slice(0, 10),
    calls: 10 + index, failed: 0,
    inputTokens: 1000, cacheReadTokens: 9000, cacheWriteTokens: 0, outputTokens: 500, reasoningTokens: 0,
    peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0,
    toolCalls: 6 + (index % 4),
    toolFailed: index % 3 === 0 ? 1 : 0,
    tools: { read: 4 + (index % 3), edit: 2 },
    byModel: {
      'm-01': { k: 'm-01', c: 8, i: 800, r: 7200, w: 0, o: 400, n: 0, pi: 0, pr: 0, pw: 0, po: 0, tc: 4, tf: 0 },
      'm-02': { k: 'm-02', c: 3, i: 200, r: 1800, w: 0, o: 100, n: 0, pi: 0, pr: 0, pw: 0, po: 0, tc: 2, tf: 1 },
    },
  }))
  return {
    rows: rows.map((row, index) => ({ ...row, toolCalls: 4 + (index % 3), toolFailed: index % 4 === 0 ? 1 : 0 })),
    prices: presets,
    presets,
    daySeries,
    hourSeries: daySeries.slice(-5).map((point, index) => ({ ...point, date: '2026-09-10T' + String(9 + index).padStart(2, '0') })),
    rates: { USD: 1, CNY: 7.15 },
    ratesSource: 'live',
    ratesUpdatedAt: '2026-09-10T00:00:00Z',
    ratesFetchedAt: new Date().toISOString(),
    targetCurrency: 'CNY',
    balance: { status: 'ok', total: 100, currency: 'CNY', infos: [], updatedAt: null, message: null },
  }
}

/**
 * 在 jsdom 里挂载面板，返回容器与卸载函数。
 * @param {object} snapshot - 快照数据。
 * @returns {Promise<{container: object, window: object, unmount: Function}>} 挂载句柄。
 */
async function mountPanel(snapshot, options = {}) {
  const { JSDOM } = requirePlatform('jsdom')
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:3080/',
  })
  const saved = new Map()
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT']) {
    saved.set(key, globalThis[key])
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  globalThis.MutationObserver = dom.window.MutationObserver
  globalThis.getComputedStyle = dom.window.getComputedStyle
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  // jsdom 没有排版引擎：柱子数量按宽度自适应，所以要显式给出"容器有多宽"和
  // 一个 ResizeObserver 替身，否则组件只能走退回分支（永远是上限柱数）。
  if (options.width !== undefined) {
    const width = options.width
    dom.window.Element.prototype.getBoundingClientRect = function rect() {
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, width, height: 0, toJSON() {} }
    }
    const savedObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback) { this.callback = callback }
      observe(target) { this.callback([{ target }], this) }
      unobserve() {}
      disconnect() {}
    }
    var restoreObserver = () => {
      if (savedObserver === undefined) delete globalThis.ResizeObserver
      else globalThis.ResizeObserver = savedObserver
    }
  }

  dom.window.__ModuleLoader__ = { load(definition) { globalThis.__tabsCaptured = definition } }
  const React = requirePlatform('react')
  const { createRoot } = requirePlatform('react-dom/client')

  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/client.js')).href + '?tabs-test=1')
  const plugin = globalThis.__tabsCaptured.factory((specifier) => {
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
  globalThis.fetch = (_url, options) => (options && options.method === 'POST'
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    : Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) }))

  const container = dom.window.document.getElementById('root')
  const root = createRoot(container)
  const { act } = React
  // 桩 t：保留 key 便于按 key 断言，同时把插值参数渲染出来——否则"合并后调用数"这类
  // 只通过插值进入 DOM 的数字在测试里根本看不见。
  const tStub = (key, params) => (params === undefined
    ? key
    : key + '(' + Object.entries(params).map(([name, value]) => name + '=' + value).join(',') + ')')
  await act(async () => { root.render(React.createElement(captured.component, { t: tStub })) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })

  const unmount = () => {
    root.unmount()
    if (typeof restoreObserver === 'function') restoreObserver()
    globalThis.fetch = originalFetch
    for (const [key, value] of saved) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
    dom.window.close()
  }
  // 面板只在总览页依赖快照；这里把 React 的 act 一并交出去，供点击后等待重渲染。
  return { container, window: dom.window, React, unmount }
}

/**
 * 点击某个标签页并等待重渲染。
 * @param {object} handle - mountPanel 的返回值。
 * @param {string} label - 标签文案片段。
 * @returns {Promise<void>}
 */
async function clickTab(handle, label) {
  const tabs = [...handle.container.querySelectorAll('.mu-tab')]
  const target = tabs.find((node) => node.textContent.includes(label))
  assert.ok(target, '找不到标签页：' + label)
  await handle.React.act(async () => {
    target.dispatchEvent(new handle.window.MouseEvent('click', { bubbles: true }))
  })
}

test('overview carries no per-model cards (they belong to the models tab)', { concurrency: 1 }, async () => {
  const handle = await mountPanel(makeSnapshot(17))
  try {
    // 首页只放"整体"的内容：趋势 / 计数 / 占比。逐个模型的明细留在明细页，
    // 两处都列模型卡片就是纯重复。
    assert.equal(handle.container.querySelectorAll('.mu-card').length, 0, '总览不渲染任何模型卡片')
    assert.ok(handle.container.querySelector('.mu-chart-card'), '总览含趋势卡')
    assert.ok(handle.container.querySelector('.mu-share-card'), '总览含占比卡')
    assert.ok(handle.container.querySelector('.mu-big'), '总览含关键数字')
    assert.ok(handle.container.querySelector('.mu-eff'), '总览含效率卡')
    assert.ok(handle.container.querySelector('.mu-more'), '总览给出进入明细页的入口')
    assert.ok(handle.container.textContent.includes('17'), '标签上标出模型总数')
  } finally {
    handle.unmount()
  }
})

test('overview DOM is identical for 6 and 40 models', { concurrency: 1 }, async () => {
  // 首页不含任何随模型数增长的元素，因此两档的宏观区块结构应完全一致。
  // 逐像素高度由 scripts/preview.mjs --measure 用真实浏览器排版核验。
  const shapes = []
  for (const count of [6, 40]) {
    const handle = await mountPanel(makeSnapshot(count))
    try {
      shapes.push({
        cards: handle.container.querySelectorAll('.mu-card').length,
        trend: !!handle.container.querySelector('.mu-chart-card'),
        share: !!handle.container.querySelector('.mu-share-card'),
        eff: !!handle.container.querySelector('.mu-eff'),
      })
    } finally {
      handle.unmount()
    }
  }
  assert.deepEqual(shapes[0], shapes[1], '6 个与 40 个模型的首页结构应一致')
  assert.equal(shapes[0].cards, 0)
})

test('overview chart never overlaps its own bounds', { concurrency: 1 }, async () => {
  const handle = await mountPanel(makeSnapshot(9))
  try {
    // 悬停明细曾用绝对定位浮层，会盖住最高的柱子并越过图表底边。
    // 现在它是图上方一条固定高度的信息行，因此不存在任何绝对定位的浮层。
    const bars = handle.container.querySelector('.mu-chart-bars')
    assert.ok(bars, '存在柱区')
    assert.equal(bars.querySelectorAll('.mu-chart-tip').length, 0, '柱区内不应有浮层')
    assert.ok(handle.container.querySelector('.mu-chart-info'), '明细改由固定高度的信息行承载')
  } finally {
    handle.unmount()
  }
})

test('models tab renders every model and the mute toggle', { concurrency: 1 }, async () => {
  const handle = await mountPanel(makeSnapshot(17))
  try {
    await clickTab(handle, 'tabModels')
    assert.equal(handle.container.querySelectorAll('.mu-card').length, 17, '明细页渲染全部模型（唯一渲染处）')
    assert.ok(handle.container.querySelector('.mu-toggle-lead'), '明细页提供"仅显示已调用"开关')
    assert.ok(!handle.container.querySelector('.mu-chart-card'), '明细页不重复放趋势图')
  } finally {
    handle.unmount()
  }
})

test('config tab holds currency, balance and add-model controls', { concurrency: 1 }, async () => {
  const handle = await mountPanel(makeSnapshot(3))
  try {
    // 配置项不应出现在总览页。
    assert.ok(!handle.container.querySelector('.mu-cur'), '总览页不含货币行')
    assert.ok(!handle.container.querySelector('.mu-add'), '总览页不含添加模型输入框')
    await clickTab(handle, 'tabConfig')
    assert.ok(handle.container.querySelector('.mu-cur'), '配置页含货币行')
    assert.ok(handle.container.querySelector('.mu-add'), '配置页含添加模型输入框')
    assert.equal(handle.container.querySelectorAll('.mu-card').length, 0, '配置页不重复渲染模型卡片')
  } finally {
    handle.unmount()
  }
})

test('tab bar switches back to the overview', { concurrency: 1 }, async () => {
  const handle = await mountPanel(makeSnapshot(9))
  try {
    await clickTab(handle, 'tabModels')
    assert.equal(handle.container.querySelectorAll('.mu-card').length, 9)
    await clickTab(handle, 'tabOverview')
    assert.equal(handle.container.querySelectorAll('.mu-card').length, 0, '切回总览不渲染模型卡片')
    assert.ok(handle.container.querySelector('.mu-chart-card'), '切回总览恢复趋势卡')
    assert.ok(handle.container.querySelector('.mu-share-card'), '切回总览恢复占比卡')
  } finally {
    handle.unmount()
  }
})

test('the plugin does not leak the locale namespace on a second apply', { concurrency: 1 }, async () => {
  // 标签页重构引入了组件外状态（受控 tab），这里顺带钉住"重复挂载不串状态"。
  const first = await mountPanel(makeSnapshot(12))
  try {
    await clickTab(first, 'tabModels')
    assert.equal(first.container.querySelectorAll('.mu-card').length, 12)
  } finally {
    first.unmount()
  }
  const second = await mountPanel(makeSnapshot(12))
  try {
    assert.equal(second.container.querySelectorAll('.mu-card').length, 0, '新挂载从总览开始（tab 状态不跨实例泄漏）')
    assert.ok(second.container.querySelector('.mu-chart-card'), '新挂载显示总览的趋势卡')
  } finally {
    second.unmount()
  }
})

test('hovering a bar shows a viewport-anchored popup without changing the layout', { concurrency: 1 }, async () => {
  const handle = await mountPanel(makeSnapshot(9), { width: 612 })
  try {
    const cols = [...handle.container.querySelectorAll('.mu-chart-col')]
    assert.ok(cols.length >= 2, '需要至少两根柱')
    // 未悬停时显示"最新时段"的摘要行，没有浮窗。
    assert.equal(handle.container.querySelectorAll('.mu-chart-tip').length, 0, '未悬停时无浮窗')
    assert.ok(handle.container.querySelector('.mu-chart-info'), '未悬停时显示摘要行')

    // React 17+ 用 mouseover/mouseout 实现 onMouseEnter/Leave。
    const enter = (node) => handle.React.act(async () => {
      node.dispatchEvent(new handle.window.MouseEvent('mouseover', { bubbles: true, relatedTarget: null }))
    })

    // 摘要行必须**始终**存在：曾经悬停时把它换成浮窗，卡片高度因此变化了 22px。
    const infoBefore = handle.container.querySelectorAll('.mu-chart-info').length
    assert.equal(infoBefore, 1, '未悬停时有摘要行')

    await enter(cols[0])
    let tip = handle.container.querySelector('.mu-chart-tip')
    assert.ok(tip, '悬停后出现浮窗')
    assert.ok(tip.querySelectorAll('.mu-chart-tip-row').length > 0, '浮窗列出各模型的用量')
    assert.ok(tip.textContent.trim().length > 0, '浮窗有内容')
    // 高度恒定的关键：摘要行在悬停时**仍然存在**，且浮窗是 fixed 定位不占布局。
    assert.equal(handle.container.querySelectorAll('.mu-chart-info').length, 1, '悬停时摘要行仍在（高度不变）')
    const tipStyle = tip.getAttribute('style') || ''
    assert.ok(/left:\s*[\d.]+px/.test(tipStyle), '浮窗用视口坐标定位（left）:' + tipStyle)
    assert.ok(/top:\s*-?[\d.]+px/.test(tipStyle), '浮窗用视口坐标定位（top）')
    assert.ok(/transform:/.test(tipStyle), '浮窗带 translate 变换以贴合柱子')

    // 悬停另一根柱：内容应随之变化（日期不同）。
    const firstDate = tip.querySelector('.mu-chart-tip-head').textContent
    await enter(cols[cols.length - 1])
    tip = handle.container.querySelector('.mu-chart-tip')
    assert.ok(tip, '悬停另一根柱仍有浮窗')
    assert.notEqual(tip.querySelector('.mu-chart-tip-head').textContent, firstDate, '浮窗内容跟随被悬停的柱')

    // 离开绘图区后浮窗消失，摘要行不变。
    await handle.React.act(async () => {
      handle.container.querySelector('.mu-chart-body')
        .dispatchEvent(new handle.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: null }))
    })
    assert.equal(handle.container.querySelectorAll('.mu-chart-tip').length, 0, '移出后浮窗消失')
    assert.equal(handle.container.querySelectorAll('.mu-chart-info').length, 1, '移出后摘要行仍在')
  } finally {
    handle.unmount()
  }
})

test('bars are packed to the left instead of stretched across the row', { concurrency: 1 }, async () => {
  // 柱数少于预算时，标记宽度由 CSS 变量给出、且 gap 固定——说明它们是靠左的定宽块，
  // 而不是 flex:1 均分整行。逐像素宽度由 Chrome 实测（preview --measure 报告柱群占用）。
  const handle = await mountPanel(makeSnapshot(3), { width: 612 })
  try {
    const bars = handle.container.querySelector('.mu-chart-bars')
    assert.ok(bars, '存在柱区')
    assert.ok(/--mu-bar-w:\s*[\d.]+px/.test(bars.getAttribute('style') || ''), '柱区带有单柱宽度变量')
    // 只画 5 根（fixture 的 daySeries 长度）时不应铺满 30 根的预算。
    const cols = handle.container.querySelectorAll('.mu-chart-col').length
    assert.ok(cols < 30, '数据点少于预算时只画实际点数（' + cols + '）')
  } finally {
    handle.unmount()
  }
})

test('bar count adapts to the available width', { concurrency: 1 }, async () => {
  // 柱数上限是 30（时间再长也不会更多），但窄栏里 30 根会挤成约 9px 的梳子，
  // 因此按容器宽度自适应减少柱数。jsdom 无排版引擎，这里用 stub 给出宽度。
  const snapshot = makeSnapshot(3)
  snapshot.daySeries = Array.from({ length: 40 }, (_, index) => ({
    ...snapshot.daySeries[index % snapshot.daySeries.length],
    date: new Date(Date.UTC(2026, 6, 1) + index * 86_400_000).toISOString().slice(0, 10),
  }))
  const wide = await mountPanel(snapshot, { width: 612 })
  try {
    const count = wide.container.querySelectorAll('.mu-chart-col').length
    assert.equal(count, 30, '宽栏用满上限 30 根（实际 ' + count + '）')
  } finally {
    wide.unmount()
  }
  const narrow = await mountPanel(snapshot, { width: 360 })
  try {
    const count = narrow.container.querySelectorAll('.mu-chart-col').length
    assert.ok(count < 30, '窄栏应减少柱数（实际 ' + count + '）')
    assert.ok(count >= 7, '柱数不应少于下限 7（实际 ' + count + '）')
    // 断言行为而不是公式：实际柱宽不得低于下限，否则柱子会细到读不出形状。
    const barWidth = Number((narrow.container.querySelector('.mu-chart-bars').getAttribute('style') || '').match(/--mu-bar-w:\s*([\d.]+)px/)?.[1])
    assert.ok(barWidth >= 12, '窄栏柱宽不得低于下限 12px（实际 ' + barWidth + 'px）')
  } finally {
    narrow.unmount()
  }
  // 没有任何 ResizeObserver 时退回上限，行为仍然正确。
  const noObserver = await mountPanel(snapshot)
  try {
    assert.equal(noObserver.container.querySelectorAll('.mu-chart-col').length, 30, '无 ResizeObserver 时退回上限')
  } finally {
    noObserver.unmount()
  }
})

test('the heatmap renders its grid even when the ledger is still empty', { concurrency: 1 }, async () => {
  // 曾经写成"有数据才渲染这张卡"：新装或刚重启（账为空）时整张卡消失，
  // 看起来像功能不存在。空账时应显示格子 + 说明。
  const snapshot = makeSnapshot(3)
  snapshot.heatSeries = []
  const handle = await mountPanel(snapshot, { width: 612 })
  try {
    assert.ok(handle.container.querySelector('.mu-heat-card'), '空账也要渲染热力图卡')
    const cells = handle.container.querySelectorAll('.mu-heat-grid .mu-heat-cell').length
    // 列数按"必须覆盖到今天"动态取（53 或 54），因此这里断言覆盖量级而不是固定值。
    assert.ok(cells >= 53 * 7 && cells <= 54 * 7, '空账时仍铺满约一年（实际 ' + cells + ' 格）')
    assert.equal(handle.container.querySelectorAll('.mu-heat-lx').length >= 0, true)
    // 全部为最浅档，不应出现深色（没有数据就没有强度）。
    assert.equal(handle.container.querySelectorAll('.mu-heat-grid .mu-heat-l4').length, 0, '空账时不应有最深档')
    assert.ok(handle.container.textContent.includes('heatEmpty'), '给出"从本版本开始累积"的说明')
  } finally {
    handle.unmount()
  }
})

test('the heatmap grid always covers today', { concurrency: 1 }, async () => {
  // 曾经的缺陷：起点回退到周日后整个窗口前移，末格变成"今天 − 今天星期几"，
  // 最近若干天的记录永远落在网格之外——表现是"热力图一片空白，像没渲染"。
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  const snapshot = makeSnapshot(3)
  snapshot.heatSeries = [{ d: key, t: 5_000_000, k: 30 }]
  const handle = await mountPanel(snapshot, { width: 612 })
  try {
    // 今天的格子必须存在，而且必须是**最深档**（它是唯一/最大值）。
    const todayCell = handle.container.querySelector('.mu-heat-grid .mu-heat-cell[title="' + key + '"]')
    assert.ok(todayCell, '网格里存在今天这一格')
    assert.ok(todayCell.className.includes('mu-heat-l4'), '今天的记录渲染为最深档（实际 ' + todayCell.className + '）')
    // 网格总天数必须 ≥ 371，且末格不早于今天。
    const dated = [...handle.container.querySelectorAll('.mu-heat-grid .mu-heat-cell[title]')]
    assert.ok(dated.length >= 371, '网格覆盖一年量级（实际 ' + dated.length + ' 格）')
    assert.equal(dated[dated.length - 1].getAttribute('title') >= key, true, '末格不早于今天')
  } finally {
    handle.unmount()
  }
})

test('the heatmap card is absent when the host does not provide the field', { concurrency: 1 }, async () => {
  // 区分"host 不支持热力图"（老版本没有该字段）与"暂无数据"：前者不该出现空壳。
  const snapshot = makeSnapshot(3)
  delete snapshot.heatSeries
  const handle = await mountPanel(snapshot, { width: 612 })
  try {
    assert.equal(handle.container.querySelector('.mu-heat-card'), null, 'host 无该字段时不渲染空壳')
  } finally {
    handle.unmount()
  }
})

test('the efficiency card stays hidden when there is no tool activity', { concurrency: 1 }, async () => {
  const bare = makeSnapshot(3)
  // 抹掉工具计数：整张卡不该留下空壳。
  bare.rows = bare.rows.map((row) => ({ ...row, toolCalls: 0, toolFailed: 0 }))
  bare.daySeries = []
  const handle = await mountPanel(bare)
  try {
    assert.equal(handle.container.querySelector('.mu-eff'), null, '没有工具活动时不渲染效率卡')
    assert.ok(handle.container.querySelector('.mu-chart-card'), '趋势卡仍在（显示空态）')
  } finally {
    handle.unmount()
  }
})

test('the preview fixture stays large enough to exercise the cap', () => {
  // 预览数据的模型数若被改小到等于总览上限，"高度不增长"就再也验不出来了。
  const source = readFileSync(join(PLUGIN_ROOT, 'scripts/preview.mjs'), 'utf8')
  assert.ok(source.includes('--models='), 'preview 支持 --models=N')
  assert.ok(/extraCount\s*=\s*Number\.isFinite\(extra\) && extra >= 0 \? extra : \d+/.test(source)
    || source.includes('extraCount'), 'preview 的默认模型数可调')
  assert.ok(PKG.scripts['preview:measure'], 'package.json 暴露 preview:measure')
})

test('the models tab merges id aliases exactly like the overview', { concurrency: 1 }, async () => {
  // 线上投诉："deepseek-flash 首页 183 元，明细页却是 8 元 + 131 元两个数字"。
  // 同一服务模型的历史 id 必须在两页口径一致，否则读者以为统计错了。
  const base = makeSnapshot(1)
  const price = { currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0 }
  const snapshot = {
    ...base,
    rows: [
      { model: 'deepseek-v4-flash', modelKey: 'deepseek-flash', calls: 10, failed: 0,
        inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0,
        peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0,
        toolCalls: 0, toolFailed: 0, providers: ['deepseek'] },
      { model: 'deepseek-flash', modelKey: 'deepseek-flash', calls: 5, failed: 0,
        inputTokens: 2_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0,
        peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0,
        toolCalls: 0, toolFailed: 0, providers: ['deepseek'] },
    ],
    prices: { 'deepseek-flash': price },
    presets: { 'deepseek-flash': price },
  }
  const handle = await mountPanel(snapshot)
  try {
    await clickTab(handle, 'tabModels')
    const cards = [...handle.container.querySelectorAll('.mu-card')]
    assert.equal(cards.length, 1, '同一服务模型只应有一张卡（实际 ' + cards.length + ' 张）')
    const titles = cards.map((card) => card.querySelector('.mu-model').textContent)
    assert.deepEqual(titles, ['deepseek-flash'], '卡片应以服务模型命名')
    const text = cards[0].textContent
    // 合并后 calls = 15，费用 = (1M + 2M) × ¥1/M = ¥3
    assert.ok(/calls=15/.test(text), '调用数应为合并后的 15：' + text)
    assert.ok(/3(?![0-9])/.test(text), '费用应为合并后的 3 元：' + text)
    assert.ok(/mergedIds/.test(text), '折叠态应提示发生了合并：' + text)
    // 展开后能看到每个历史 id 的分项，便于对账。
    await handle.React.act(async () => {
      cards[0].querySelector('.mu-card-head').dispatchEvent(new handle.window.MouseEvent('click', { bubbles: true }))
    })
    const ids = [...handle.container.querySelectorAll('.mu-merge-id')].map((node) => node.textContent)
    assert.deepEqual(ids.sort(), ['deepseek-flash', 'deepseek-v4-flash'], '展开区应列出全部历史 id')
  } finally {
    handle.unmount()
  }
})
