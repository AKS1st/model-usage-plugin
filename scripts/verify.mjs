/**
 * 独立验证：在**不启动、不重启** dsh web 进程的前提下，检查 model-usage-plugin
 * 是否具备安全上线条件。plugins/ 目录下的自研插件在安装到 profile 之前必须
 * 先跑通这里，避免装完重启把 web 进程挂死。
 *
 * 七项检查：
 *   1. 两个半部的语法
 *   2. Host 半部可导入，且 apply → dispose 生命周期干净
 *   3. Client 半部可作为 __ModuleLoader__ 闭包工厂注册与回收
 *   4. Client 组件在 Node 里能真正渲染出 markup（抓"渲染即崩"）
 *   5. 组合树可解析，且插件行确实出现在 profile 里（不加载模块，只验组合）
 *   6. 用真实 $DSH_HOME 数据跑一次价格/迁移路径
 *   7. 单元测试全绿
 *
 * 用法：node scripts/verify.mjs [--real-home]
 *   --real-home  允许读取并变更真实 $DSH_HOME（默认只用插件内的 .verify-home 存根）
 *
 * 退出码 0 = 可以重启，非 0 = 不要重启。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'))
const USE_REAL_HOME = process.argv.includes('--real-home')
const REAL_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const VERIFY_HOME = join(PLUGIN_ROOT, '.verify-home')

// React 是 shell 提供的平台模块，不是本插件的依赖：按 shell 实际解析路径去解析，
// 依次尝试 profile 的 node_modules 与本地 harness 检出。
const PLATFORM_ROOTS = [
  join(REAL_HOME, 'profiles', 'web', 'package.json'),
  join(PLUGIN_ROOT, 'package.json'),
  '/home/zero/AgentX/harness/package.json',
  // react-dom 只在 client 包的依赖里可见，借一个 client workspace 解析。
  '/home/zero/AgentX/harness/packages/client/ui-chat/package.json',
]

/**
 * 安装一个最小 DOM 外壳（jsdom），模拟浏览器半部真实的运行环境。
 * 客户端 apply 会往 document.head 注入样式表，没有 DOM 会直接抛错。
 * @returns {{window: object, uninstall: Function}} jsdom 窗口与卸载函数。
 */
function installDom() {
  const { JSDOM } = requirePlatform('jsdom')
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' },
  )
  const saved = new Map()
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle']) {
    saved.set(key, globalThis[key])
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  globalThis.MutationObserver = dom.window.MutationObserver
  globalThis.getComputedStyle = dom.window.getComputedStyle
  return {
    window: dom.window,
    uninstall: () => {
      for (const [key, value] of saved) {
        if (value === undefined) delete globalThis[key]
        else globalThis[key] = value
      }
      dom.window.close()
    },
  }
}

/**
 * 按平台模块语义 require 一个模块（React / react-dom）。
 * @param {string} specifier - 模块名。
 * @returns {unknown} 模块导出。
 */
function requirePlatform(specifier) {
  const errors = []
  for (const root of PLATFORM_ROOTS) {
    try {
      return createRequire(root)(specifier)
    } catch (err) {
      errors.push(root + ': ' + (err && err.message ? err.message.split('\n')[0] : String(err)))
    }
  }
  throw new Error('cannot resolve platform module ' + specifier + '\n  ' + errors.join('\n  '))
}

const results = []
let current = null

/** 开始一项检查。 */
function check(name) {
  current = { name, ok: true, notes: [] }
  results.push(current)
  process.stdout.write('· ' + name + '\n')
}

/** 记录一条通过信息。 */
function ok(note) {
  if (note) current.notes.push(note)
  process.stdout.write('    ok   ' + (note || '') + '\n')
}

/** 记录失败并继续后续检查，返回 false 便于分支。 */
function fail(note) {
  current.ok = false
  process.stdout.write('    FAIL ' + note + '\n')
  return false
}

/** 断言辅助：条件为假时记失败。 */
function assertThat(condition, note) {
  return condition ? (ok(note), true) : fail(note)
}

// ---------- 1. 语法 ----------

check('源文件语法')
for (const file of ['src/index.js', 'src/client.js', 'src/route-security.js']) {
  const res = spawnSync(process.execPath, ['--check', join(PLUGIN_ROOT, file)], { encoding: 'utf8' })
  if (res.status !== 0) fail(file + ': ' + (res.stderr || '').split('\n')[0])
}
if (current.ok) ok('3 个源文件均通过 node --check')

// ---------- 2. Host 生命周期 ----------

check('Host 半部 apply → dispose 生命周期')
{
  const home = mkdtempSync(join(tmpdir(), 'musage-verify-host-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href)
    assertThat(typeof mod.apply === 'function', '导出 apply()')
    assertThat(typeof mod.name === 'string' && mod.name.length > 0, '导出 name')
    assertThat(Array.isArray(mod.inject), '导出 inject')

    const disposers = []
    let disposed = false
    const intervalIds = []
    const ctx = {
      // 不提供 webServer，走"没有 webServer 也不崩"的分支。
      get: () => undefined,
      on: () => () => {},
      // 真实 cordis 的 ctx 一定有 inject；插件用它做延迟注入。
      inject: () => {},
      effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
      interval: (fn, delay) => {
        const id = setInterval(fn, delay)
        intervalIds.push(id)
        return () => clearInterval(id)
      },
    }
    mod.apply(ctx)
    ok('apply() 未抛错')
    // 触发 dispose 路径（插件用 ctx.on('dispose') 注册）。
    const disposeHandlers = []
    const ctx2 = { ...ctx, on: (event, handler) => { if (event === 'dispose') disposeHandlers.push(handler); return () => {} } }
    const mod2 = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href + '?dispose-check=1')
    mod2.apply(ctx2)
    for (const handler of disposeHandlers) handler()
    disposed = true
    ok('dispose 路径执行未抛错（' + disposeHandlers.length + ' 个 handler）')
    for (const id of intervalIds) clearInterval(id)
    assertThat(disposed, '生命周期可完整走完')
  } catch (err) {
    fail('Host 半部异常: ' + (err && err.message ? err.message : String(err)))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
}

// ---------- 3. Client 注册与回收 ----------

/**
 * 在 Node 里搭一个最小浏览器外壳，捕获客户端半部注册的模块与 slot。
 * @returns {{module: object, entries: object[], disposers: Function[], unload: Function}}
 */
function loadClientBundle() {
  const state = { module: null, entries: [], disposers: [] }
  const localeDictionaries = new Map()
  // 先装 DOM，再把模块加载器挂到同一个 window 上（client.js 会读 window 全局）。
  const dom = installDom()
  dom.window.__ModuleLoader__ = {
    load(definition) { state.module = definition },
  }
  const fakeRequire = (specifier) => {
    if (specifier === 'react') {
      // 用真实的 React，让渲染检查是真渲染而不是打桩。
      return requirePlatform('react')
    }
    throw new Error('unexpected require: ' + specifier)
  }
  return {
    state,
    fakeRequire,
    localeDictionaries,
    dom,
    unload: () => { dom.uninstall() },
  }
}

check('主题一致性（按钮 / 表单控件只用设计令牌）')
{
  try {
    const client = readFileSync(join(PLUGIN_ROOT, 'src/client.js'), 'utf8')
    // 面板与 shell 同处一个设置面板，控件样式必须取自主题令牌；
    // 手写边框/写死颜色会让它在设置页里像另一套控件（这正是曾经的缺陷）。
    // 先剥掉注释：注释里会提到这些反例（例如说明"写死 #fff 会坏"），
    // 直接在原文上匹配会把说明文字当成违规。
    const css = client.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const forbidden = [
      // 只约束交互控件：卡片/容器用 1px border-l1 画分隔是正当用法。
      { pattern: /\.mu-(btn|input|select|tab|more|price-toggle)[^{]*\{[^}]*border:\s*1px/, note: '控件用 1px 边框（系统口径是 0.5px border-l3/l4）' },
      // 只认真正的颜色字面量：`white-space` 这类属性名不算。
      { pattern: /(?<![\w-])white(?![\w-])|#fff\b|#ffffff\b|:\s*#[0-9a-fA-F]{3,6}/, note: '写死的颜色字面量（深色主题下会与底色撞车）' },
      { pattern: /\.mu-(btn|input|select|tab)[^{]*\{[^}]*border-radius:\s*[0-5]px/, note: '按钮/输入框半径过小（胶囊 14px、控件 8px）' },
    ]
    for (const rule of forbidden) {
      const hit = css.match(rule.pattern)
      if (hit) fail(rule.note + ' → ' + String(hit[0]).slice(0, 60))
    }
    // 必须真的用上交互态令牌，否则 hover/active 在深色主题下没有反馈。
    for (const token of ['--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-active', '--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-fill']) {
      if (!client.includes(token)) fail('缺少主题令牌: ' + token)
    }
    if (current.ok) ok('按钮 / 输入框 / 选中态均取自 --dsw-alias-*，无手写颜色')
  } catch (err) {
    fail('主题一致性检查异常: ' + (err && err.message ? err.message : String(err)))
  }
}

check('Client 半部注册与回收')
{
  const shell = loadClientBundle()
  try {
    const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/client.js')).href)
    assertThat(shell.state.module !== null, '调用 window.__ModuleLoader__.load()')
    assertThat(shell.state.module.id === PKG.name, '注册 id 与包名一致（' + PKG.name + '）')
    assertThat(typeof shell.state.module.factory === 'function', '提供 factory(require)')

    const plugin = shell.state.module.factory(shell.fakeRequire)
    assertThat(Array.isArray(plugin.inject), '插件声明 inject')
    assertThat(typeof plugin.apply === 'function', '插件提供 apply()')

    // 伪 slots / locale，记录注册项与 disposer，验证 dispose 能回收。
    const slotDisposers = []
    const ctx = {
      on: () => () => {},
      interval: () => () => {},
      // 真实 cordis 的 ctx 一定有 inject；插件用它做延迟注入。
      inject: () => {},
      effect: (fn, label) => {
        const d = fn()
        shell.state.disposers.push({ label, dispose: d })
        return () => {}
      },
      get: (name) => {
        if (name === 'slots') {
          return {
            inject: (slotName, register) => { register() },
            register: (options, component) => {
              shell.state.entries.push({ options, component })
              const dispose = () => {}
              slotDisposers.push(dispose)
              return dispose
            },
          }
        }
        if (name === 'locale') {
          return {
            register: (ns, lang, dict) => { shell.localeDictionaries.set(ns + ':' + lang, dict); return () => {} },
            bind: (ns) => (key) => (shell.localeDictionaries.get(ns + ':zh') || {})[key] || key,
          }
        }
        return undefined
      },
    }
    plugin.apply(ctx)
    assertThat(shell.state.entries.length > 0, '注册了 ' + shell.state.entries.length + ' 个 slot 入口')
    const registered = shell.state.entries[0].options
    assertThat(registered && registered.name === 'settings.section', '注册到 settings.section')
    // 中英文字典都注册，且 key 集合对称（缺 key 会静默回退成 key 本身）。
    const zh = shell.localeDictionaries.get(PKG.name + ':zh')
    const en = shell.localeDictionaries.get(PKG.name + ':en')
    assertThat(!!zh && !!en, '注册了 zh / en 两套字典')
    if (zh && en) {
      const zhOnly = Object.keys(zh).filter((k) => !(k in en))
      const enOnly = Object.keys(en).filter((k) => !(k in zh))
      assertThat(zhOnly.length === 0 && enOnly.length === 0,
        '字典 key 对称（zh 独有 ' + zhOnly.length + ' / en 独有 ' + enOnly.length + '）')
    }
    // 回收：所有 effect disposer 都要能安全调用。
    let disposeErrors = 0
    for (const { dispose } of shell.state.disposers) {
      try { if (typeof dispose === 'function') dispose() } catch { disposeErrors += 1 }
    }
    assertThat(disposeErrors === 0, 'effect disposer 全部可安全回收')
  } catch (err) {
    fail('Client 半部异常: ' + (err && err.stack ? err.stack.split('\n')[0] : String(err)))
  } finally {
    shell.unload()
  }
}

// ---------- 4. Client 组件真渲染 ----------

check('Client 组件渲染（jsdom 真实挂载 + 数据态）')
{
  const shell = loadClientBundle()
  try {
    const React = requirePlatform('react')
    const { createRoot } = requirePlatform('react-dom/client')

    const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/client.js')).href + '?render-check=2')
    const plugin = shell.state.module.factory(shell.fakeRequire)

    let captured = null
    const localeDictionaries = new Map()
    plugin.apply({
      on: () => () => {},
      interval: () => () => {},
      // 真实 cordis 的 ctx 一定有 inject；插件用它做延迟注入。
      inject: () => {},
      effect: (fn) => { fn(); return () => {} },
      get: (name) => {
        if (name === 'slots') {
          return {
            inject: (slotName, register) => { register() },
            register: (options, component) => { captured = { options, component }; return () => {} },
          }
        }
        if (name === 'locale') {
          return {
            register: (ns, lang, dict) => { localeDictionaries.set(ns + ':' + lang, dict); return () => {} },
            bind: (ns) => (key) => (localeDictionaries.get(ns + ':zh') || {})[key] || key,
          }
        }
        return undefined
      },
    })
    if (!assertThat(captured !== null, '捕获到组件工厂')) {
      // 没有组件就无从渲染。
    } else {
      // 代表性快照：覆盖"有价格且已调用""有价格但未调用""无价格的第三方模型"。
      const presets = {
        'deepseek-flash': { currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0, peak: { enabled: true, start: '01:00', end: '04:00', timezone: 'UTC', weekdays: [1, 2, 3, 4, 5], input: 2, output: 8, cacheRead: 0.04, cacheWrite: 0 }, peak2: { enabled: true, start: '06:00', end: '10:00', timezone: 'UTC', weekdays: [1, 2, 3, 4, 5] }, presetRev: 2 },
        'gpt-5.6-sol': { currency: 'USD', input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
      }
      // 额外模型：总览上限是 5，这里凑到 7 个可计价模型，才能压到"超出上限"的引导分支。
      for (let index = 0; index < 4; index += 1) {
        const name = 'aux-' + (index + 1)
        presets[name] = { currency: 'CNY', input: 2 + index, output: 6 + index * 2, cacheRead: 0.2, cacheWrite: 0 }
      }
      const snapshot = {
        rows: [
          { model: 'deepseek-flash', modelKey: 'deepseek-flash', calls: 12, failed: 1, inputTokens: 62822, cacheReadTokens: 400256, cacheWriteTokens: 0, outputTokens: 6658, reasoningTokens: 2000, peakInputTokens: 1000, peakCacheReadTokens: 2000, peakCacheWriteTokens: 0, peakOutputTokens: 500, providers: ['deepseek-official'], toolCalls: 5, toolFailed: 0 },
          { model: 'deepseek-v4-pro', modelKey: 'deepseek-flash', calls: 3, failed: 0, inputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 300, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, providers: ['deepseek-official'], toolCalls: 6, toolFailed: 0 },
          { model: 'gpt-5.6-sol', modelKey: 'gpt-5.6-sol', calls: 5, failed: 0, inputTokens: 500, cacheReadTokens: 900, cacheWriteTokens: 10, outputTokens: 100, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, providers: ['openai-codex'], toolCalls: 7, toolFailed: 1 },
          ...['aux-1', 'aux-2', 'aux-3', 'aux-4'].map((name, index) => ({
            model: name, modelKey: name, calls: 4 - index, failed: 0,
            inputTokens: 400, cacheReadTokens: 800, cacheWriteTokens: 0, outputTokens: 90, reasoningTokens: 0,
            peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0,
            providers: ['aux-provider'], toolCalls: 8, toolFailed: 0,
          })),
        ],
        prices: { 'deepseek-flash': presets['deepseek-flash'], 'gpt-5.6-sol': presets['gpt-5.6-sol'] },
        presets,
        // 时间序列：3 个模型 × 多天，并带一个高峰小时，覆盖趋势图/占比环/堆叠条三条路径。
        daySeries: Array.from({ length: 40 }, (_, index) => {
          const date = new Date(Date.UTC(2026, 7, 1) + index * 86_400_000).toISOString().slice(0, 10)
          const scale = 1 + (index % 5)
          return {
            date,
            calls: 3 * scale,
            failed: 0,
            inputTokens: 1000 * scale,
            cacheReadTokens: 4000 * scale,
            cacheWriteTokens: 0,
            outputTokens: 500 * scale,
            reasoningTokens: 100 * scale,
            peakInputTokens: 200 * scale,
            peakCacheReadTokens: 800 * scale,
            peakCacheWriteTokens: 0,
            peakOutputTokens: 100 * scale,
            // 工具指标：效率卡与趋势卡的「工具」口径都依赖这几个字段。
            toolCalls: 10 + (index % 5) * 3,
            toolFailed: index % 4 === 0 ? 1 : 0,
            tools: index === 39 ? { read: 14, edit: 6, bash: 3 } : { read: 9, edit: 3 },
            byModel: {
              'deepseek-flash': { k: 'deepseek-flash', c: 2 * scale, i: 800 * scale, r: 3200 * scale, w: 0, o: 400 * scale, n: 80 * scale, pi: 160 * scale, pr: 640 * scale, pw: 0, po: 80 * scale, tc: 8 + (index % 5) * 3, tf: index % 4 === 0 ? 1 : 0 },
              'gpt-5.6-sol': { k: 'gpt-5.6-sol', c: scale, i: 200 * scale, r: 800 * scale, w: 0, o: 100 * scale, n: 20 * scale, pi: 40 * scale, pr: 160 * scale, pw: 0, po: 20 * scale, tc: 2, tf: 0 },
            },
          }
        }),
        hourSeries: Array.from({ length: 5 }, (_, index) => ({
          date: '2026-09-10T' + String(10 + index).padStart(2, '0'),
          calls: 2, failed: 0,
          inputTokens: 300, cacheReadTokens: 900, cacheWriteTokens: 0, outputTokens: 120, reasoningTokens: 0,
          peakInputTokens: 100, peakCacheReadTokens: 300, peakCacheWriteTokens: 0, peakOutputTokens: 40,
          byModel: { 'deepseek-flash': { k: 'deepseek-flash', c: 2, i: 300, r: 900, w: 0, o: 120, n: 0, pi: 100, pr: 300, pw: 0, po: 40 } },
        })),
        // 热力图日账：只发有活动的日子，每天两个标量。
        // 日期相对"今天"生成：写死日期会在时间推移后落到网格之外，让热力图变成空网格。
        heatSeries: Array.from({ length: 300 }, (_, index) => {
          const day = new Date()
          day.setHours(0, 0, 0, 0)
          day.setDate(day.getDate() - index)
          const intensity = 0.2 + 0.8 * Math.abs(Math.sin(index / 6.3))
          if (intensity < 0.25) return null
          const key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0')
          return { d: key, t: Math.round(150_000 * intensity), k: Math.round(12 * intensity) }
        }).filter(Boolean),
        pluginVersion: PKG.version,
        backfill: { state: 'done', days: 7, sessions: 12, scanned: 12 },
        heatBackfilled: true,
        rates: { USD: 1, CNY: 7.15 },
        ratesSource: 'live',
        ratesUpdatedAt: '2026-09-10T00:00:00Z',
        ratesFetchedAt: new Date().toISOString(),
        targetCurrency: 'CNY',
        balance: { status: 'ok', total: 88.5, currency: 'CNY', infos: [{ currency: 'CNY', total: 88.5, granted: 0, toppedUp: 88.5 }], updatedAt: '2026-09-10T00:00:00Z', message: null },
      }

      // 组件挂载时会 GET 快照、POST 刷新余额与汇率；这里全部本地应答，不发真请求。
      const calls = []
      const originalFetch = globalThis.fetch
      globalThis.fetch = (url, options) => {
        calls.push((options && options.method) || 'GET')
        if (options && options.method === 'POST') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) })
      }

      let root = null
      const container = shell.dom.window.document.getElementById('root')
      try {
        root = createRoot(container)
        root.render(React.createElement(captured.component, { t: (key) => key }))
        // 等 useEffect 的异步 fetch 落地并触发一次重渲染。
        await new Promise((r) => setTimeout(r, 250))
        const html = container.innerHTML
        const text = container.textContent || ''
        assertThat(calls.length > 0, '挂载后发起了 ' + calls.length + ' 次快照请求')
        assertThat(text.includes('deepseek-flash'), '数据态渲染出模型名 deepseek-flash')
        assertThat(text.includes('gpt-5.6-sol'), '数据态渲染出模型名 gpt-5.6-sol')
        assertThat(html.includes('mu-page'), '输出包含面板根节点')
        assertThat(!/NaN|Infinity/.test(text), '文本不含 NaN / Infinity')
        // 未配置价格的模型要给出可见提示，而不是空白或 0 元。
        assertThat(!text.includes('undefined'), '文本不含 undefined')
        // 图表必须真的画出来，而不是在数据态悄悄退化成空卡。
        assertThat(html.includes('mu-chart-card'), '趋势卡已渲染')
        assertThat(html.includes('mu-chart-seg'), '趋势图有堆叠段')
        // 占比按"花费去向"呈现（横向条），不再用环形图：一家独大时环形图等于整圆，
        // 且按 token 排会藏起"调用少但单价高"的模型。
        // 花费占比改为行内呈现（不再有单独的"花费去向"卡），与模型列表共用同一排序。
        assertThat(html.includes('mu-share-bar'), '占比条已渲染')
        assertThat(html.includes('mu-share-pct'), '占比百分数已渲染')
        // 本检查只负责"在真实 DOM 里渲染不崩 + 宏观结构正确"。逐个子页面的
        // 详细契约（明细页的模型卡片、配置页的控件）由 tests/panel.test.mjs 覆盖，
        // 而它本身就是本闸门的一项（npm test），不必在这里重复一套。
        //
        // 首页只放"整体"的内容（趋势 / 计数 / 占比），逐个模型的卡片只在明细页。
        // 注意不能用 /mu-card\b/：`\b` 在 `-` 前也成立，会把 mu-card-head 一起数进来。
        const cardCount = (html.match(/class="mu-card[ "]/g) || []).length
        assertThat(cardCount === 0, '总览不渲染模型卡片（实际 ' + cardCount + '）')
        assertThat(html.includes('mu-share-card'), '总览含占比卡')
        // 金额精度分档：主数字不该出现 6 位小数那种读不出来的形态。
        // 注意不要用 `$` 之类的边界：textContent 会把多处金额连成一串，中间位置的金额匹配不到。
        const moneyShown = text.match(/[\d,]+\.\d+(?=\s*CNY)/g) || []
        // 契约是分档的：>=0.01 最多 4 位，<0.01 才允许到 6 位（缓存命中单价极低）。
        // 拿单一的位数上限去断言会把合规的小额项误判成缺陷。
        const tooPrecise = moneyShown.filter((value) => {
          const digits = (value.match(/\.(\d+)/) || [])[1].length
          const magnitude = Number(value.replace(/,/g, ''))
          return digits > (magnitude < 0.01 ? 6 : 4)
        })
        assertThat(moneyShown.length > 0, '金额已按目标货币渲染（样例 ' + moneyShown.slice(0, 3).join(', ') + '）')
        assertThat(tooPrecise.length === 0,
          '金额小数位符合分档契约（越界 ' + (tooPrecise.slice(0, 3).join(' / ') || '无') + '）')
        assertThat(html.includes('mu-ring') === false, '已移除环形图（避免整圆失真）')
        assertThat((html.match(/mu-chart-col/g) || []).length >= 20, '柱数符合窗口（>=20）')
        // 趋势卡默认按费用口径，避免"用量大 = 花钱多"的误读。
        assertThat(text.includes('byCost'), '趋势卡默认选中费用口径')
        // 模型卡片默认收起：token 明细不应铺开，费用必须是可见的主数字。
        // 子页面结构：主页只放宏观统计，明细与配置收进各自标签页，主页高度不随模型数增长。
        // 工具指标：趋势卡多一个「工具」口径，总览多一张效率卡。
        assertThat(html.includes('byTools'), '趋势卡提供工具口径')
        assertThat(html.includes('mu-eff'), '总览效率卡已渲染')
        assertThat(html.includes('mu-eff-tool'), '效率卡展示高频工具')
        // 悬停明细曾用绝对定位浮层，会盖住柱子并越过图表底边；现在是固定高度信息行。
        assertThat(html.includes('mu-chart-info'), '图表明细为固定高度信息行')
        assertThat(html.includes('mu-chart-tip') === false, '图表不含绝对定位浮层')
        // 优先级契约：花费与余额必须在所有图表之前——它是用户最先要看的东西。
        const bigIndex = html.indexOf('class="mu-big"')
        const chartIndex = html.indexOf('class="mu-chart-card"')
        assertThat(bigIndex >= 0 && chartIndex >= 0 && bigIndex < chartIndex,
          '关键数字（花费/余额）排在趋势图之前' + (bigIndex >= 0 && chartIndex >= 0 ? '（' + bigIndex + ' < ' + chartIndex + '）' : ''))
        assertThat(html.includes('mu-heat-card'), '热力图卡已渲染')
        assertThat(html.includes('mu-heat-l4'), '热力图含最深档格子')
        // 历史回填必须可见：否则用户无法判断它跑没跑。
        assertThat(html.includes('heatBackfilled'), '热力图卡显示历史回填天数')
        const heatCells = (html.match(/mu-heat-cell/g) || []).length
        assertThat(heatCells >= 300, '热力图格子数达一年量级（实际 ' + heatCells + '）')
                // 版本标签：重启是否真换上了新代码，界面要能自证。
                assertThat(html.includes('mu-version'), '面板显示运行中的插件版本')
                assertThat(html.includes('v' + PKG.version), '版本号来自快照（' + PKG.version + '）')
        assertThat(html.includes('mu-tabs'), '标签页导航已渲染')
        assertThat((html.match(/mu-tab\b/g) || []).length >= 3, '存在总览/明细/配置三个标签')
        assertThat(html.includes('mu-more'), '总览给出进入明细页的入口')
        assertThat(html.includes('mu-cur') === false, '总览页不含配置项（已收进配置页）')
        assertThat(html.includes('mu-add') === false, '总览页不含添加模型（已收进配置页）')
      } finally {
        if (root) root.unmount()
        globalThis.fetch = originalFetch
      }
    }
  } catch (err) {
    fail('渲染异常: ' + (err && err.stack ? err.stack.split('\n').slice(0, 2).join(' | ') : String(err)))
  } finally {
    shell.unload()
  }
}

// ---------- 5. 组合树 ----------

check('profile 组合树可解析且包含本插件')
{
  try {
    const stub = join(VERIFY_HOME, 'profiles', 'web')
    if (!existsSync(stub)) {
      mkdirSync(stub, { recursive: true })
      for (const file of ['cordis.yml', 'cordis.patch.yml', 'package.json']) {
        const from = join(REAL_HOME, 'profiles', 'web', file)
        if (existsSync(from)) cpSync(from, join(stub, file))
      }
      const modules = join(REAL_HOME, 'profiles', 'web', 'node_modules')
      if (existsSync(modules)) symlinkSync(modules, join(stub, 'node_modules'))
    }
    const res = spawnSync('dsh', ['--profile', 'web', '--dump-config'], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: VERIFY_HOME },
      timeout: 240_000,
    })
    const output = (res.stdout || '') + (res.stderr || '')
    assertThat(res.status === 0, 'dsh --dump-config 退出码 0')
    assertThat(output.includes('- id: ' + PKG.name), '组合树包含 ' + PKG.name + ' 行')
    // dump-config 只解析组合，不加载模块——这里明确记录，避免被误当成语法闸门。
    ok('注意：dump-config 不加载插件模块，语法与渲染由前面几项负责')
  } catch (err) {
    fail('组合检查异常: ' + (err && err.message ? err.message : String(err)))
  }
}

// ---------- 6. 真实数据的价格路径 ----------

check('价格与迁移路径（真实数据）')
{
  const source = join(REAL_HOME, 'musage-stats.json')
  if (!existsSync(source)) {
    ok('真实数据文件不存在，跳过（新安装场景）')
  } else {
    const home = mkdtempSync(join(tmpdir(), 'musage-verify-price-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      cpSync(source, join(home, 'musage-stats.json'))
      // 价格路径检查只需确认落盘结果，把防抖压短以免拖慢整条验证。
      process.env.DSH_MODEL_USAGE_FLUSH_MS = '60'
      const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href + '?price-check=1')
      const intervalIds = []
      mod.apply({
        get: () => undefined,
        on: () => () => {},
        // 真实 cordis 的 ctx 一定有 inject；插件用它做延迟注入。
        inject: () => {},
        effect: (fn) => { fn(); return () => {} },
        interval: (fn, delay) => { const id = setInterval(fn, delay); intervalIds.push(id); return () => clearInterval(id) },
      })
      await new Promise((r) => setTimeout(r, 500))
      for (const id of intervalIds) clearInterval(id)
      const after = JSON.parse(readFileSync(join(home, 'musage-stats.json'), 'utf8'))
      assertThat(after.version >= 5, '数据文件已升级到 version ' + after.version)
      const flash = after.prices['deepseek-flash'] || after.prices['deepseek-v4-flash']
      assertThat(!!flash, '存在 DeepSeek Flash 价格条目')
      if (flash) {
        assertThat(flash.input === 1 && flash.output === 4 && flash.cacheRead === 0.02,
          '基础价为官方 V4.1 口径（¥1/¥4/¥0.02）')
        assertThat(flash.peak && flash.peak.timezone === 'UTC' && JSON.stringify(flash.peak.weekdays) === '[1,2,3,4,5]',
          '高峰窗口锚定 UTC 且限工作日')
      }
      // 所有统计里出现过的 DeepSeek 系模型都必须能解析到价格。
      const { internals } = mod
      const unresolved = Object.keys(after.stats || {}).filter((model) =>
        /deepseek/.test(model) && !internals.presetFor(model) && !after.prices[model])
      assertThat(unresolved.length === 0, '所有 DeepSeek 模型均可计费（未解析: ' + unresolved.join(', ') + '）')
      if (USE_REAL_HOME) ok('注意：--real-home 只影响读取来源，写入始终在临时目录')
    } catch (err) {
      fail('价格路径异常: ' + (err && err.message ? err.message : String(err)))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      rmSync(home, { recursive: true, force: true })
    }
  }
}

// ---------- 7. 真实排版：横向与纵向都不能越界 ----------

check('真实排版不越界（Chrome 实测）')
{
  // 这一项防的是一类曾经两次流到用户手上的缺陷：**子元素戳出容器**。
  // jsdom 没有排版引擎，所以只能靠真实浏览器度量；语法与渲染检查都看不见它。
  const chrome = spawnSync('sh', ['-c', 'command -v google-chrome || command -v chromium || true'], { encoding: 'utf8' })
  const browser = (chrome.stdout || '').trim()
  if (browser === '') {
    ok('未找到 Chrome/Chromium，跳过（此项需要真实排版引擎）')
  } else {
    // 两种状态都要量：默认态，以及**悬停浮窗展开**态——浮层越出图表正是曾经两次
    // 流到线上的缺陷，只量默认态会漏掉它。
    const scenes = [
      { label: '默认态', args: [] },
      { label: '悬停浮窗态', args: ['--hover=5'] },
    ]
    const sceneHeights = []
    for (const scene of scenes) {
      const res = spawnSync(process.execPath, ['scripts/preview.mjs', '--measure', ...scene.args], {
        cwd: PLUGIN_ROOT,
        encoding: 'utf8',
        timeout: 180_000,
      })
      const output = (res.stdout || '') + (res.stderr || '')
      if (res.status !== 0) {
        fail(scene.label + '：preview --measure 退出码 ' + res.status + ': ' + output.split('\n').slice(-3).join(' | '))
        continue
      }
      const vertical = output.match(/纵向越界：无/) ? [] : output.split('\n').filter((line) => /越出 /.test(line))
      const horizontal = /横向溢出：无/.test(output)
      const barLine = (output.match(/柱数：.*/) || [])[0]
      const height = (output.match(/页面总高：(\d+)px/) || [])[1]
      if (height) sceneHeights.push({ scene: scene.label, height: Number(height) })
      // 浮窗必须存在（悬停场景）且不得越出视口。
      const tipLine = (output.match(/悬停气泡：([^\n]*)/) || [])[1] || ''
      if (scene.args.length > 0) {
        if (/未展开/.test(tipLine)) fail(scene.label + '：浮窗未渲染，量不到它')
        else if (/越出视口/.test(tipLine)) fail(scene.label + '：浮窗越出视口 ' + tipLine.trim())
      }
      if (vertical.length > 0) {
        fail(scene.label + ' 纵向越界：' + vertical.slice(0, 3).map((line) => line.trim()).join(' / '))
      } else if (!horizontal) {
        const lines = output.split('\n')
        const at = lines.findIndex((line) => line.includes('横向溢出'))
        fail(scene.label + ' 横向溢出：' + lines.slice(at + 1, at + 3).map((line) => line.trim()).join(' / '))
      } else {
        ok(scene.label + '：无横向溢出、无纵向越界' + (barLine ? '（' + barLine.replace('柱数：', '柱数 ') + '）' : ''))
      }
    }
    // 悬停不得改变页面高度：摘要行常驻、浮窗 fixed 不占布局。
    // 曾经悬停时把摘要行换成浮窗，高度因此跳了 22px。
    if (sceneHeights.length === 2) {
      if (sceneHeights[0].height === sceneHeights[1].height) {
        ok('悬停前后高度一致（' + sceneHeights[0].height + 'px）')
      } else {
        fail('悬停改变了页面高度：' + sceneHeights.map((entry) => entry.scene + ' ' + entry.height + 'px').join(' vs '))
      }
    }

    // 靠左排列的判据：数据点少时柱群占用宽度应远小于绘图区宽度。
    const leftAligned = spawnSync(process.execPath, ['scripts/preview.mjs', '--measure', '--days=5'], {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      timeout: 180_000,
    })
    const match = ((leftAligned.stdout || '') + (leftAligned.stderr || '')).match(/柱群占用 (\d+)px \/ 绘图区 (\d+)px/)
    if (!match) {
      fail('无法读到柱群占用宽度')
    } else {
      const extent = Number(match[1])
      const plot = Number(match[2])
      if (extent < plot * 0.5) ok('柱靠左排列（5 个数据点时柱群占 ' + extent + 'px / 绘图区 ' + plot + 'px）')
      else fail('柱似乎仍被拉伸铺满整行（占 ' + extent + 'px / ' + plot + 'px）')
    }

    // 文档里写的是**实测数字**，因此会随布局改动而过期。过期的文档比没有文档更误导：
    // 读者会照着一个不存在的界面去理解代码。这里把声称值与重新量出的值对上。
    // 注意核对的是 docs/DEVELOPMENT.md：布局类数字属于开发者文档，README 面向使用者。
    const devDoc = readFileSync(join(PLUGIN_ROOT, 'docs/DEVELOPMENT.md'), 'utf8')
    const measure = (args) => {
      const res = spawnSync(process.execPath, ['scripts/preview.mjs', '--measure', ...args], {
        cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 180_000,
      })
      const hit = ((res.stdout || '') + (res.stderr || '')).match(/页面总高：(\d+)px/)
      return hit ? Number(hit[1]) : null
    }
    const steadyClaim = Number((devDoc.match(/个模型实测都是 (\d+)px/) || [])[1])
    const configClaim = Number((devDoc.match(/\*\*配置\*\*[^\n]*?(\d+)px\s*\|/) || [])[1])
    const measuredDefault = sceneHeights[0] && sceneHeights[0].height
    const measuredAt90 = measure(['--models=90'])
    const measuredConfig = measure(['--tab=config'])
    const drift = []
    if (!Number.isFinite(steadyClaim)) {
      drift.push('文档里找不到"高度恒定"的实测声明（核对锚点丢了）')
    } else {
      // 声明的是"不随模型数增长"，所以默认态与 90 模型态都必须等于该值。
      if (measuredDefault !== steadyClaim) drift.push('总览声称 ' + steadyClaim + 'px，默认态实测 ' + measuredDefault + 'px')
      if (measuredAt90 !== steadyClaim) drift.push('总览声称 ' + steadyClaim + 'px，90 模型实测 ' + measuredAt90 + 'px')
    }
    if (Number.isFinite(configClaim) && measuredConfig !== configClaim) {
      drift.push('配置页声称 ' + configClaim + 'px，实测 ' + measuredConfig + 'px')
    }
    if (drift.length > 0) fail('文档里的实测数字已过期：' + drift.join('；'))
    else ok('DEVELOPMENT.md 的实测高度与当前代码一致（默认 ' + measuredDefault + 'px · 90 模型 ' + measuredAt90 + 'px · 配置 ' + measuredConfig + 'px）')
  }
}

// ---------- 9. 发布产物 ----------

check('npm 发布产物完整且最小')
{
  // 发布出去的东西和本地跑的东西必须是同一份。`files` 是白名单，最容易出的错是
  // 漏掉运行时真正需要的文件（装上就直接报错），或把测试与脚本一起发出去
  // （使用者拿到一堆跑不起来、也不需要的东西）。所以既查"该有的在不在"，
  // 也查"不该有的有没有混进去"，并把真实 tarball 解开导入一次。
  const cache = join(VERIFY_HOME, 'npm-cache')
  mkdirSync(cache, { recursive: true })
  const env = { ...process.env, npm_config_cache: cache }
  const dry = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 240_000, env,
  })
  let listed = null
  try {
    const parsed = JSON.parse((dry.stdout || '').trim() || '[]')
    listed = parsed[0] && parsed[0].files ? parsed[0].files.map((file) => file.path) : null
  } catch { listed = null }
  if (listed === null) {
    fail('npm pack --dry-run 无法解析：' + ((dry.stderr || dry.stdout || '').split('\n').slice(-3).join(' | ')))
  } else {
    const required = ['src/index.js', 'src/client.js', 'src/route-security.js', 'cordis.patch.yml', 'README.md', 'LICENSE', 'package.json']
    const missing = required.filter((file) => !listed.includes(file))
    const forbidden = listed.filter((file) => /^(tests|scripts|docs|\.verify)/.test(file))
    if (missing.length > 0) fail('发布产物缺少运行时必需文件：' + missing.join(', '))
    else if (forbidden.length > 0) fail('发布产物混入了开发文件（应在 files 白名单外）：' + forbidden.slice(0, 5).join(', '))
    else ok('产物含 ' + listed.length + ' 个文件：' + required.join(' / '))

    // 真解包一次并导入 Host 半部：`node --check` 只验语法，导入才验证相对导入与顶层
    // 求值在**发布形状**下成立（工作区里能跑、发布后装不上，正是这里会漏掉的）。
    const stage = mkdtempSync(join(tmpdir(), 'musage-pack-'))
    try {
      const packed = spawnSync('npm', ['pack', '--pack-destination', stage], {
        cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 240_000, env,
      })
      const tarball = (readdirSync(stage) || []).find((name) => name.endsWith('.tgz'))
      if (!tarball) {
        fail('npm pack 没有产出 tarball：' + ((packed.stderr || '').split('\n').slice(-2).join(' | ')))
      } else {
        const untar = spawnSync('tar', ['-xzf', join(stage, tarball), '-C', stage], { encoding: 'utf8' })
        if (untar.status !== 0) {
          fail('解包失败：' + (untar.stderr || '').split('\n')[0])
        } else {
          const mod = await import(pathToFileURL(join(stage, 'package', 'src/index.js')).href + '?pack-check=1')
          if (typeof mod.apply !== 'function') fail('解包后的 Host 半部没有导出 apply()')
          else ok('解包后的产物可导入（' + tarball + '，导出 apply/name/inject）')
        }
      }
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }
  // npm 的缓存目录会随着每次校验涨到几百 MB（只在 .verify-home 里，但没理由留着）。
  // 这一项跑完就删：下次重跑会重建，代价只是一次本地 pack。
  rmSync(cache, { recursive: true, force: true })
}

// ---------- 10. 单元测试 ----------

check('单元测试')
{
  const res = spawnSync('npm', ['test'], { cwd: PLUGIN_ROOT, encoding: 'utf8', timeout: 300_000 })
  const output = (res.stdout || '') + (res.stderr || '')
  const summary = output.match(/# (tests|pass|fail) (\d+)/g)
  if (res.status !== 0) {
    fail('npm test 退出码 ' + res.status)
    const failures = output.split('\n').filter((line) => line.startsWith('not ok'))
    for (const line of failures.slice(0, 5)) process.stdout.write('    ' + line + '\n')
  } else {
    ok(summary ? summary.join(' | ') : 'npm test 通过')
  }
}

// ---------- 汇总 ----------

const failed = results.filter((r) => !r.ok)
process.stdout.write('\n' + '='.repeat(64) + '\n')
for (const r of results) {
  process.stdout.write((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '\n')
}
process.stdout.write('='.repeat(64) + '\n')
if (failed.length > 0) {
  process.stdout.write('\n结论：' + failed.length + ' 项未通过 —— 不要重启 dsh web。\n')
  process.exit(1)
}
process.stdout.write('\n结论：全部通过（' + results.length + ' 项）—— 可以安全重启 dsh web。\n')
process.stdout.write('提醒：重启由你自己执行，本脚本不会触碰正在运行的进程。\n')
process.exit(0)
