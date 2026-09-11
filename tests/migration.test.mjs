import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { internals } from '../src/index.js'

// 把写盘防抖压到 60ms：否则每个用例都要等满 4 秒的防抖窗口。
process.env.DSH_MODEL_USAGE_FLUSH_MS = '60'

const { peakWindowSignature, PEAK_WINDOW_SIGNATURES, PRESET_REV, presetFor, LEGACY_PRESET_PRICES, PRESET_PRICES } = internals

// 0.3.x 发出的默认高峰窗口：按服务器本地时间，无工作日限制。
const LEGACY_WINDOWS = {
  peak: { enabled: true, start: '09:00', end: '12:00', input: 3, output: 9, cacheRead: 0.1, cacheWrite: 0 },
  peak2: { enabled: true, start: '14:00', end: '18:00' },
}

test('the shipped preset revision is registered as a known window signature', () => {
  const signature = peakWindowSignature(presetFor('deepseek-flash'))
  assert.equal(PEAK_WINDOW_SIGNATURES.get(signature), PRESET_REV)
})

test('the pre-0.3.2 window signature maps to an older revision', () => {
  const signature = peakWindowSignature(LEGACY_WINDOWS)
  const rev = PEAK_WINDOW_SIGNATURES.get(signature)
  assert.ok(rev, `legacy window signature ${signature} must be recognised`)
  assert.ok(rev < PRESET_REV, 'a legacy window must map to an older revision than the current preset')
})

test('an unknown user window is not mistaken for a shipped preset', () => {
  const custom = { peak: { enabled: true, start: '22:00', end: '23:30' }, peak2: { enabled: false } }
  assert.equal(PEAK_WINDOW_SIGNATURES.has(peakWindowSignature(custom)), false)
})

test('a disabled peak window has a stable signature', () => {
  assert.equal(peakWindowSignature({ peak: { enabled: false, start: '01:00', end: '04:00' } }), '-;-')
  assert.equal(peakWindowSignature({}), '-;-')
})

/**
 * 用临时 DSH_HOME 启动一次真实 apply，返回落盘后的状态。
 * @param {object} initial - 初始数据文件内容。
 * @returns {Promise<object>} 落盘内容（同步驱动防抖回调，不依赖定时器时机）。
 */
async function applyWithState(initial) {
  const home = mkdtempSync(join(tmpdir(), 'musage-plugin-test-'))
  writeFileSync(join(home, 'musage-stats.json'), JSON.stringify(initial))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    // dataFile 在 apply 内计算，所以这里不需要绕模块缓存。
    const mod = await import('../src/index.js')
    // 直接驱动防抖回调：它内部 stopWriteTimer + flushSync 会同步落盘，
    // 不必等定时器，也就不受调度时机影响（等定时器在负载下会读到旧文件）。
    const pending = []
    const disposeHandlers = []
    const ctx = {
      webServer: undefined,
      on: (event, handler) => {
        if (event === 'dispose') disposeHandlers.push(handler)
        return () => {}
      },
      interval: (fn) => { pending.push(fn); return () => {} },
      get: () => undefined,
      // 真实 cordis 的 ctx 一定有 inject；插件用它做延迟注入。
      inject: () => {},
      effect: () => () => {},
    }
    mod.apply(ctx)
    for (const fn of pending) fn()
    // 迁移只调 schedulePersist（防抖），没有待驱动回调时走 dispose 的同步 flush。
    if (pending.length === 0) for (const handler of disposeHandlers) handler()
    return JSON.parse(readFileSync(join(home, 'musage-stats.json'), 'utf8'))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
}

const V4_STATE = {
  version: 4,
  targetCurrency: 'CNY',
  stats: { 'deepseek-v4-flash': { calls: 10, failed: 0, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, reasoningTokens: 0, peakInputTokens: 100, peakOutputTokens: 50, peakCacheReadTokens: 200, cacheWriteTokens: 0, peakCacheWriteTokens: 0, providers: ['deepseek-official'] } },
  // 0.3.2 的 V4-Flash 旧价 + 旧窗口；V4-Pro 的基础价与当时官方一致。
  prices: {
    'deepseek-v4-flash': { ...LEGACY_WINDOWS, currency: 'CNY', input: 1.5, output: 4.5, cacheRead: 0.05, cacheWrite: 0 },
    'deepseek-v4-pro': { ...LEGACY_WINDOWS, currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0 },
  },
  removed: [],
}

/** 断言一个价格对象的"官方口径"部分：基础价 + UTC 工作日高峰窗口 + 版本戳。 */
function assertOfficialShape(price, model, base) {
  assert.ok(price, `${model} 必须保留价格条目`)
  assert.equal(price.input, base.input, `${model}.input`)
  assert.equal(price.output, base.output, `${model}.output`)
  assert.equal(price.cacheRead, base.cacheRead, `${model}.cacheRead`)
  assert.equal(price.peak.input, base.input * 2, `${model}.peak.input`)
  assert.equal(price.peak.output, base.output * 2, `${model}.peak.output`)
  assert.equal(price.peak.cacheRead, base.cacheRead * 2, `${model}.peak.cacheRead`)
  assert.equal(price.peak.start, '01:00', `${model} peak window A start`)
  assert.equal(price.peak.end, '04:00', `${model} peak window A end`)
  assert.equal(price.peak2.start, '06:00', `${model} peak window B start`)
  assert.equal(price.peak2.end, '10:00', `${model} peak window B end`)
  assert.equal(price.peak.timezone, 'UTC', `${model} 必须锚定 UTC`)
  assert.deepEqual(price.peak.weekdays, [1, 2, 3, 4, 5], `${model} 必须限工作日`)
  assert.equal(price.presetRev, PRESET_REV, `${model} 必须带当前版本戳`)
}

test('startup migration upgrades stale defaults to the current official prices', { concurrency: 1 }, async () => {
  const after = await applyWithState(V4_STATE)
  assert.equal(after.version, 7, 'data file version should be bumped')
  // V4-Flash 已下线，旧 id 由 V4.1 Flash 服务并按 Flash 价计费。
  assertOfficialShape(after.prices['deepseek-v4-flash'], 'deepseek-v4-flash',
    { input: 1, output: 4, cacheRead: 0.02 })
  // V4-Pro 在官方公布的改路由时点之前仍是 V4-Pro-0813，价格是它自己的那一列。
  assertOfficialShape(after.prices['deepseek-v4-pro'], 'deepseek-v4-pro',
    { input: 4.5, output: 13.5, cacheRead: 0.15 })
  // 改路由用**时点规则**表达，而不是把价格改成 Flash 价。
  assert.equal(after.prices['deepseek-v4-pro'].rerouteFrom, '2026-09-14T04:00:00Z')
  assert.equal(after.prices['deepseek-v4-pro'].rerouteTo, 'deepseek-flash')
})

test('startup backfills a price for a model that has usage but no entry', { concurrency: 1 }, async () => {
  // `record()` 的自动套用只在首次调用时触发；若某模型首次调用时价格表里还没有它
  // （例如 `deepseek-flash` 在旧版本里不存在），之后永远不会补上，界面上就出现
  // "有调用量但没有价格"。启动时必须有兜底。
  const state = {
    version: 6,
    targetCurrency: 'CNY',
    stats: { 'deepseek-flash': { calls: 772, failed: 9, inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 9_000_000, reasoningTokens: 0, peakInputTokens: 0, peakOutputTokens: 0, peakCacheReadTokens: 0, cacheWriteTokens: 0, peakCacheWriteTokens: 0, providers: ['deepseek-official'] } },
    prices: {},
    removed: [],
  }
  const after = await applyWithState(state)
  const price = after.prices['deepseek-flash']
  assert.ok(price, 'deepseek-flash 应被补上价格')
  assert.equal(price.input, 1)
  assert.equal(price.output, 4)
  assert.equal(price.cacheRead, 0.02)
})

test('startup backfill respects a user-removed price', { concurrency: 1 }, async () => {
  const state = {
    version: 6,
    targetCurrency: 'CNY',
    stats: { 'deepseek-flash': { calls: 5, failed: 0, inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, reasoningTokens: 0, peakInputTokens: 0, peakOutputTokens: 0, peakCacheReadTokens: 0, cacheWriteTokens: 0, peakCacheWriteTokens: 0, providers: [] } },
    prices: {},
    removed: ['deepseek-flash'],
  }
  const after = await applyWithState(state)
  assert.equal(after.prices['deepseek-flash'], undefined, '用户显式移除过的价格不应被自动补回')
})

test('startup migration leaves statistics untouched', { concurrency: 1 }, async () => {
  const after = await applyWithState(V4_STATE)
  // 只比对该用例关心的用量字段：host 会为新版本补齐默认计数
  // （如 toolCalls/toolFailed），这不属于"迁移改动了统计"。
  const usageFields = ['calls', 'failed', 'inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'peakInputTokens', 'peakCacheReadTokens', 'peakCacheWriteTokens', 'peakOutputTokens']
  for (const [model, before] of Object.entries(V4_STATE.stats)) {
    const current = after.stats[model]
    assert.ok(current, model + ' 应保留在统计里')
    for (const field of usageFields) {
      assert.equal(current[field], before[field], model + '.' + field)
    }
  }
})

test('startup migration preserves a user-disabled peak switch', { concurrency: 1 }, async () => {
  const custom = {
    ...V4_STATE,
    prices: {
      'deepseek-v4-pro': {
        currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0,
        peak: { enabled: false, start: '', end: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        peak2: { enabled: false, start: '', end: '' },
      },
    },
  }
  const after = await applyWithState(custom)
  const price = after.prices['deepseek-v4-pro']
  // 用户明确关掉了峰谷：既不该被重新打开，也不该被换成默认价。
  assert.equal(price.peak.enabled, false)
  assert.equal(price.peak2.enabled, false)
  assert.equal(price.input, 4.5)
})

test('startup migration does not overwrite a custom price', { concurrency: 1 }, async () => {
  const custom = {
    ...V4_STATE,
    prices: {
      'glm-4.6': { currency: 'CNY', input: 9.99, output: 9.99, cacheRead: 9.99, cacheWrite: 9.99 },
    },
  }
  const after = await applyWithState(custom)
  assert.equal(after.prices['glm-4.6'].input, 9.99)
})

test('startup migration repairs a legacy entry whose peak switch is on but windows are empty', { concurrency: 1 }, async () => {
  // 手加模型会留下"峰谷开关开着、两个时段都为空"的价格。这类价格从未计过高峰，
  // 不能当成用户自定义时段，必须连基础价一起按当前口径重建。
  const legacy = {
    ...V4_STATE,
    prices: {
      'deepseek-v4-flash-vision-exp': {
        currency: 'CNY', input: 1.5, output: 4.5, cacheRead: 0.05, cacheWrite: 0,
        peak: { enabled: true, start: '', end: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        peak2: { enabled: true, start: '', end: '' },
      },
    },
  }
  const after = await applyWithState(legacy)
  const price = after.prices['deepseek-v4-flash-vision-exp']
  assert.equal(price.input, 1, 'stale base price must be replaced')
  assert.equal(price.cacheRead, 0.02)
  assert.equal(price.peak.start, '01:00')
  assert.equal(price.peak.timezone, 'UTC')
  assert.deepEqual(price.peak.weekdays, [1, 2, 3, 4, 5])
})

test('startup migration keeps a single custom peak window instead of replacing it', { concurrency: 1 }, async () => {
  // 用户只想要一个高峰时段、单价也是自填的：既不该被覆盖，空窗口也不该留着显示为"已启用"。
  const single = {
    ...V4_STATE,
    prices: {
      'deepseek-v4-pro': {
        currency: 'CNY', input: 7.5, output: 9.5, cacheRead: 0.5, cacheWrite: 0,
        peak: { enabled: true, start: '13:00', end: '15:00', input: 15, output: 19, cacheRead: 1, cacheWrite: 0 },
        peak2: { enabled: false, start: '', end: '' },
      },
    },
  }
  const after = await applyWithState(single)
  const price = after.prices['deepseek-v4-pro']
  assert.equal(price.input, 7.5, 'custom base price must survive')
  assert.equal(price.peak.start, '13:00', 'custom window must survive')
  assert.equal(price.peak2.enabled, false)
})

test('historical price generations never equal the current presets', () => {
  // 迁移靠"基础价等于历史默认价"识别旧数据；若两者相同就成了无声覆盖。
  for (const generation of Object.values(LEGACY_PRESET_PRICES)) {
    for (const [model, stale] of Object.entries(generation)) {
      const current = PRESET_PRICES[model]
      if (!current) continue
      const same = stale.currency === current.currency
        && stale.input === current.input
        && stale.output === current.output
        && stale.cacheRead === current.cacheRead
      assert.equal(same, false, `${model} historical price must differ from the current preset`)
    }
  }
})
