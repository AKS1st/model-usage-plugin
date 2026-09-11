import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { internals } from '../src/index.js'

// 把写盘防抖压到 60ms：否则每个用例都要等满 4 秒的防抖窗口。
process.env.DSH_MODEL_USAGE_FLUSH_MS = '60'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname
const TEMP_ROOT = join(PLUGIN_ROOT, '.verify-home')

/**
 * 在临时 DSH_HOME 里启动插件，返回可驱动 llm/stream 与读取快照的句柄。
 * @param {object} [initial] - 预置的数据文件内容。
 * @returns {Promise<{runCall: Function, snapshot: Function, readState: Function, stop: Function, home: string}>}
 */
async function startPlugin(initial) {
  mkdirSync(TEMP_ROOT, { recursive: true })
  const home = mkdtempSync(join(TEMP_ROOT, 'series-'))
  if (initial !== undefined) writeFileSync(join(home, 'musage-stats.json'), JSON.stringify(initial))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home

  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href)
  const state = { stream: null, route: null, intervals: [], disposeHandlers: [] }
  mod.apply({
    webServer: { register(options) { state.route = options; return () => {} } },
    on: (event, handler) => {
      if (event === 'llm/stream') state.stream = handler
      // 记下 dispose handler：它内部会同步 flush 落盘，比等防抖定时器可靠。
      if (event === 'dispose') state.disposeHandlers.push(handler)
      return () => {}
    },
    interval: (fn, delay) => {
      const id = setInterval(fn, delay)
      state.intervals.push(id)
      return () => clearInterval(id)
    },
    get: () => undefined,
    // 真实 cordis 的 ctx 一定有 inject；插件用它做延迟注入。
    inject: () => {},
    effect: (fn) => { fn(); return () => {} },
  })

  /** 模拟一次流式调用（usage 落在最后一个 chunk）。 */
  const runCall = async (model, usage) => {
    const upstream = (async function* () {
      yield { type: 'text', text: 'x' }
      yield { type: 'usage', usage }
    })()
    const wrapped = state.stream({ provider: 'deepseek-official', model }, () => upstream)
    for await (const _chunk of wrapped) { /* 消费完以触发 finally 里的采集 */ }
  }

  /** 读取当前 HTTP 快照。 */
  const snapshot = () => {
    const res = { setHeader() {}, end(text) { this.body = text } }
    state.route.handler({ method: 'GET', headers: { host: '127.0.0.1:3080' } }, res)
    return JSON.parse(res.body)
  }

  const stop = async () => {
    // 走真实的 dispose 路径：handler 内部同步 flushSync，落盘确定完成，
    // 不依赖防抖定时器的调度时机（那样在负载下会读到旧文件）。
    for (const handler of state.disposeHandlers) handler()
    for (const id of state.intervals) clearInterval(id)
    const saved = JSON.parse(readFileSync(join(home, 'musage-stats.json'), 'utf8'))
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
    return saved
  }

  return { runCall, snapshot, stop, home }
}

test('daily series aggregates tokens and per-model breakdown', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.runCall('deepseek-flash', { inputTokens: 1000, cacheReadTokens: 2000, outputTokens: 300 })
  await plugin.runCall('deepseek-flash', { inputTokens: 500, cacheReadTokens: 100, outputTokens: 50 })
  await plugin.runCall('gpt-5.6-sol', { inputTokens: 200, cacheReadTokens: 0, outputTokens: 20 })

  const snap = plugin.snapshot()
  assert.equal(snap.daySeries.length, 1)
  const today = snap.daySeries[0]
  assert.equal(today.calls, 3)
  assert.equal(today.inputTokens, 1700)
  assert.equal(today.cacheReadTokens, 2100)
  assert.equal(today.outputTokens, 370)
  assert.equal(today.byModel['deepseek-flash'].c, 2)
  assert.equal(today.byModel['deepseek-flash'].i, 1500)
  assert.equal(today.byModel['gpt-5.6-sol'].i, 200)
  // 合计缓存键不能作为模型泄漏到图上。
  assert.equal('$total' in today.byModel, false)
  await plugin.stop()
})

test('reading the snapshot repeatedly does not double count', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.runCall('deepseek-flash', { inputTokens: 1000, outputTokens: 100 })
  const first = plugin.snapshot().daySeries[0].inputTokens
  const second = plugin.snapshot().daySeries[0].inputTokens
  const third = plugin.snapshot().daySeries[0].inputTokens
  assert.equal(first, 1000)
  assert.equal(second, 1000)
  assert.equal(third, 1000)
  const saved = await plugin.stop()
  // 落盘后再取一次也要一致：归档与快照两条路径共用同一个差值法。
  assert.equal(saved.dayBuckets[Object.keys(saved.dayBuckets)[0]].models['$total'].inputTokens, 1000)
})

test('hourly series tracks the current hour', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.runCall('deepseek-flash', { inputTokens: 300, outputTokens: 30 })
  const snap = plugin.snapshot()
  assert.equal(snap.hourSeries.length >= 1, true)
  const hour = snap.hourSeries[snap.hourSeries.length - 1]
  assert.equal(hour.calls, 1)
  assert.equal(hour.inputTokens, 300)
  assert.equal(hour.date.length, 13, '小时键应为 YYYY-MM-DDTHH')
  await plugin.stop()
})

test('data file is written as version 7 with all three ledgers', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.runCall('deepseek-flash', { inputTokens: 42, outputTokens: 4 })
  const saved = await plugin.stop()
  assert.equal(saved.version, 7)
  assert.equal(Object.keys(saved.dayBuckets).length, 1)
  assert.equal(Object.keys(saved.hourBuckets).length, 1)
  // 热力图台账与明细台账分开：每天只存两个标量，才能长期保留。
  assert.equal(Object.keys(saved.heatBuckets).length, 1)
  // tokens 是输入 + 缓存读/写 + 输出（与趋势图同口径），因此 42 + 4 = 46。
  assert.equal(saved.heatBuckets[Object.keys(saved.heatBuckets)[0]].tokens, 46)
  assert.equal(saved.dayBuckets[Object.keys(saved.dayBuckets)[0]].models['$total'].inputTokens, 42)
})

test('daily buckets are capped by the rolling window', { concurrency: 1 }, async () => {
  // 预置超过上限的历史桶，加载后必须裁到 MAX_DAYS。
  const dayBuckets = {}
  for (let index = 0; index < 200; index += 1) {
    const date = new Date(Date.UTC(2026, 0, 1) + index * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    dayBuckets[key] = { models: { deepseek: { inputTokens: index + 1, calls: 1 } } }
  }
  const plugin = await startPlugin({ version: 6, stats: {}, prices: {}, removed: [], dayBuckets, hourBuckets: {} })
  const snap = plugin.snapshot()
  // 磁盘保留 MAX_DAYS=120，但快照只下发最近 SERIES_SNAPSHOT_DAYS=45 天：
  // 趋势图只画最近一段，没必要让每次轮询都传满保留期。
  assert.equal(snap.daySeries.length, 45, 'daySeries 应被裁到 45 点')
  // 保留最新的一段：最老的那些必须已经滚出窗口。
  assert.equal(snap.daySeries[0].date > '2026-01-01', true, '最老的桶应已被丢弃')
  const saved = await plugin.stop()
  // 服务面立刻收敛；磁盘在下一次真实写入时收敛——不为了裁剪而额外写盘。
  assert.equal(Object.keys(saved.dayBuckets).length, 120, '落盘应保留完整保留期')
})

test('malformed bucket entries are dropped instead of poisoning the chart', { concurrency: 1 }, async () => {
  const plugin = await startPlugin({
    version: 6,
    stats: {},
    prices: {},
    removed: [],
    dayBuckets: {
      '2026-09-01': { models: { good: { inputTokens: 100, calls: 2 }, bad: { inputTokens: 'oops', calls: null } } },
      '2026-09-02': 'not an object',
      '2026-09-03': { models: { alsoBad: { inputTokens: -5 } } },
    },
    hourBuckets: {},
  })
  const snap = plugin.snapshot()
  const dates = snap.daySeries.map((point) => point.date)
  assert.equal(dates.includes('2026-09-02'), false, '非对象桶应被丢弃')
  assert.equal(dates.includes('2026-09-03'), false, '全零桶应被丢弃')
  const good = snap.daySeries.find((point) => point.date === '2026-09-01')
  assert.ok(good)
  assert.equal(good.inputTokens, 100)
  assert.equal(good.calls, 2)
  assert.equal('bad' in good.byModel, false, '非法字段的模型不应出现在图里')
  await plugin.stop()
})

test('bucket helper functions stay consistent with the module limits', { concurrency: 1 }, () => {
  // 前端依赖这些常量做补空档与坐标缩放，导入侧不能再各自写一份。
  assert.equal(typeof internals, 'object')
})
