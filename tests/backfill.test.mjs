import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { aggregateSessionEvents } from '../src/index.js'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname
const TEMP_ROOT = join(PLUGIN_ROOT, '.verify-home')

/** 本地日键，与 host 的分桶口径一致。 */
const dayKey = (time) => {
  const d = new Date(time)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** 某天中午 12:00 本地时间的时间戳。 */
function noonOf(daysAgo) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d.getTime()
}

test('aggregateSessionEvents sums usage per local day', () => {
  const events = [
    { type: 'request/context', time: noonOf(2), data: { provider: 'p', model: 'model-a' } },
    { type: 'assistant/message', time: noonOf(2), data: { usage: { inputTokens: 100, cacheReadTokens: 200, outputTokens: 50 } } },
    { type: 'assistant/message', time: noonOf(2), data: { usage: { inputTokens: 10, outputTokens: 5 } } },
    { type: 'tool/call', time: noonOf(2), data: { name: 'read' } },
    { type: 'tool/result', time: noonOf(2), data: { name: 'read' } },
    { type: 'tool/call', time: noonOf(2), data: { name: 'edit' } },
    { type: 'tool/result', time: noonOf(2), data: { name: 'edit', error: { message: 'boom' } } },
  ]
  const days = aggregateSessionEvents(events, dayKey)
  const entry = days.get(dayKey(noonOf(2)))
  assert.ok(entry, '应有该日的聚合')
  // tokens = 输入 + 缓存读 + 缓存写 + 输出
  assert.equal(entry.tokens, 100 + 200 + 50 + 10 + 5)
  assert.equal(entry.tools, 2, '工具调用只在 tool/call 计数')
  assert.equal(entry.toolFailed, 1, '失败只在 tool/result 带 error 时计数')
  assert.equal(entry.models.get('model-a').calls, 2)
})

test('aggregateSessionEvents follows the most recent model', () => {
  const events = [
    { type: 'request/context', time: noonOf(3), data: { model: 'model-a' } },
    { type: 'assistant/message', time: noonOf(3), data: { usage: { inputTokens: 1, outputTokens: 1 } } },
    { type: 'request/context', time: noonOf(3), data: { model: 'model-b' } },
    { type: 'assistant/message', time: noonOf(3), data: { usage: { inputTokens: 2, outputTokens: 2 } } },
  ]
  const entry = aggregateSessionEvents(events, dayKey).get(dayKey(noonOf(3)))
  assert.equal(entry.models.get('model-a').inputTokens, 1)
  assert.equal(entry.models.get('model-b').inputTokens, 2)
})

test('aggregateSessionEvents ignores events without usage', () => {
  const entry = aggregateSessionEvents([
    { type: 'assistant/message', time: noonOf(4), data: {} },
    { type: 'request/header', time: noonOf(4), data: { header: { config: { model: 'm' } } } },
  ], dayKey).get(dayKey(noonOf(4)))
  assert.equal(entry, undefined, '没有 usage 就不该产生日聚合')
})

// ---------- 与 ctx.sessionQuery 的集成 ----------

/**
 * 启动插件，注入一个假的 sessionQuery 服务。
 * @param {object} [initial] - 预置的数据文件内容。
 * @param {object[]} [sessions] - 假会话（{ id, createdAt, events, inheritedEventCount }）。
 * @returns {Promise<{snapshot: Function, stop: Function, readCalls: string[]}>}
 */
/**
 * @param {object} [initial] - 预置的数据文件。
 * @param {object[]} [sessions] - 假会话。
 * @param {'immediate'|'late'|'absent'} [injectMode] - 服务出现的时机。
 *   `immediate`：apply 时已可用；`late`：apply 后才可用（**线上就是这个情况**）；
 *   `absent`：始终没有该服务。
 */
async function startWithHistory(initial, sessions, injectMode = 'immediate', listSessionsHook = null) {
  mkdirSync(TEMP_ROOT, { recursive: true })
  const home = mkdtempSync(join(TEMP_ROOT, 'backfill-'))
  if (initial !== undefined) writeFileSync(join(home, 'musage-stats.json'), JSON.stringify(initial))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home

  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href)
  const state = { route: null, intervals: [], intervalFns: [], dispose: [], readCalls: [], handlers: {} }
  const query = {
    async listSessions() {
      // 默认正常返回；测试可注入"挂住/抛错"的行为来复现线上故障。
      if (listSessionsHook !== null) return await listSessionsHook(sessions)
      return sessions.map((s) => ({ header: { id: s.id, createdAt: s.createdAt }, live: false, persisted: true }))
    },
    async readSession(id) {
      state.readCalls.push(id)
      const found = sessions.find((s) => s.id === id)
      return { session: { id }, inheritedEventCount: found.inheritedEventCount || 0, events: found.events }
    },
  }
  // `late` 模式模拟线上：apply 执行时服务尚未注册，之后才出现。
  const availableNow = injectMode !== 'late' && injectMode !== 'absent'
  mod.apply({
    webServer: { register(options) { state.route = options; return () => {} } },
    on: (event, handler) => {
      if (event === 'dispose') state.dispose.push(handler)
      ;(state.handlers[event] = state.handlers[event] || []).push(handler)
      return () => {}
    },
    timeout: (fn, delay) => {
      // 与 interval 同为 disposer 语义；测试里也真实挂上定时器。
      const id = setTimeout(fn, delay)
      state.intervals.push(id)
      return () => clearTimeout(id)
    },
    interval: (fn, delay) => {
      state.intervalFns.push(fn)
      const id = setInterval(fn, delay)
      state.intervals.push(id)
      return () => clearInterval(id)
    },
    get: (name) => (name === 'sessionQuery' && availableNow ? query : undefined),
    // 延迟注入：真实 cordis 在依赖可用后回调。这里按 injectMode 决定是否/何时回调。
    inject: (deps, callback) => {
      if (injectMode === 'absent') return undefined
      if (injectMode === 'immediate') return callback({ sessionQuery: query })
      // late：先不回调，等测试显式触发。
      state.pendingInject = () => callback({ sessionQuery: query })
      return undefined
    },
    effect: (fn) => { fn(); return () => {} },
  })

  // 回填是异步的：等它落定。
  await new Promise((resolve) => setTimeout(resolve, 300))

  const snapshot = () => {
    const res = { setHeader() {}, end(text) { this.body = text } }
    state.route.handler({ method: 'GET', headers: { host: '127.0.0.1:3080' } }, res)
    return JSON.parse(res.body)
  }
  const stop = async () => {
    for (const handler of state.dispose) handler()
    for (const id of state.intervals) clearInterval(id)
    const saved = JSON.parse(readFileSync(join(home, 'musage-stats.json'), 'utf8'))
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
    return saved
  }
  return { snapshot, stop, readCalls: state.readCalls, state, sessions,
    // 模拟一条真实会话事件到达（不经过 cordis，只驱动监听器）。
    emit: (event) => { for (const handler of state.handlers['session/event'] || []) handler({ id: 'live' }, event) },
  }
}

test('backfill fills days missing from the ledger', { concurrency: 1 }, async () => {
  const history = [{
    id: 's1',
    createdAt: noonOf(5),
    events: [
      { type: 'request/context', time: noonOf(5), data: { model: 'model-a' } },
      { type: 'assistant/message', time: noonOf(5), data: { usage: { inputTokens: 1000, outputTokens: 500 } } },
      { type: 'tool/call', time: noonOf(5), data: { name: 'read' } },
    ],
  }]
  const plugin = await startWithHistory(undefined, history)
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.state, 'done', '回填应完成')
  const day = snap.heatSeries.find((entry) => entry.d === dayKey(noonOf(5)))
  assert.ok(day, '历史那天应出现在热力账里')
  assert.equal(day.t, 1500, 'tokens 应等于 输入+输出')
  assert.equal(day.k, 1, '工具调用数')
  await plugin.stop()
})

test('backfill does not touch days already in the ledger', { concurrency: 1 }, async () => {
  // 关键：实时采集已经写过的日子不能再算一遍，否则会重复计数。
  const existingDay = dayKey(noonOf(5))
  const initial = {
    version: 7,
    stats: {},
    prices: {},
    removed: [],
    heatBuckets: { [existingDay]: { tokens: 999, tools: 9 } },
  }
  const history = [{
    id: 's1',
    createdAt: noonOf(5),
    events: [
      { type: 'request/context', time: noonOf(5), data: { model: 'model-a' } },
      { type: 'assistant/message', time: noonOf(5), data: { usage: { inputTokens: 100000, outputTokens: 100000 } } },
    ],
  }]
  const plugin = await startWithHistory(initial, history)
  const snap = plugin.snapshot()
  const day = snap.heatSeries.find((entry) => entry.d === existingDay)
  assert.equal(day.t, 999, '已有账的日子必须保持原值，不能被回填覆盖或叠加')
  await plugin.stop()
})

test('backfill skips today so the live ledger owns it', { concurrency: 1 }, async () => {
  const history = [{
    id: 's1',
    createdAt: noonOf(0),
    events: [
      { type: 'request/context', time: noonOf(0), data: { model: 'model-a' } },
      { type: 'assistant/message', time: noonOf(0), data: { usage: { inputTokens: 5000, outputTokens: 5000 } } },
    ],
  }]
  const plugin = await startWithHistory(undefined, history)
  const snap = plugin.snapshot()
  const today = snap.heatSeries.find((entry) => entry.d === dayKey(noonOf(0)))
  assert.equal(today, undefined, '今天不应被回填写入（由实时采集负责）')
  await plugin.stop()
})

test('backfill drops fork-inherited events', { concurrency: 1 }, async () => {
  // fork 会话的日志前面是继承自父会话的事件；不切掉就会把同一批用量算两次。
  const inheritedAndOwn = [
    { type: 'request/context', time: noonOf(6), data: { model: 'model-a' } },
    { type: 'assistant/message', time: noonOf(6), data: { usage: { inputTokens: 1000, outputTokens: 1000 } } },
    { type: 'assistant/message', time: noonOf(6), data: { usage: { inputTokens: 7, outputTokens: 3 } } },
  ]
  const history = [{
    id: 'fork',
    createdAt: noonOf(6),
    inheritedEventCount: 2,
    events: inheritedAndOwn,
  }]
  const plugin = await startWithHistory(undefined, history)
  const snap = plugin.snapshot()
  const day = snap.heatSeries.find((entry) => entry.d === dayKey(noonOf(6)))
  assert.equal(day.t, 10, '只应统计自有事件（7+3），继承的 2000 必须丢弃')
  await plugin.stop()
})

test('backfill waits for a service that appears after apply', { concurrency: 1 }, async () => {
  // **线上就是这个情况**：组合里挂了该服务，但 apply 执行时它还没注册，
  // 直接 ctx.get 会拿到 undefined → 回填静默不跑。必须用延迟注入等服务就绪。
  const history = [{
    id: 's1',
    createdAt: noonOf(9),
    events: [
      { type: 'request/context', time: noonOf(9), data: { model: 'model-a' } },
      { type: 'assistant/message', time: noonOf(9), data: { usage: { inputTokens: 400, outputTokens: 100 } } },
    ],
  }]
  const plugin = await startWithHistory(undefined, history, 'late')
  assert.equal(plugin.snapshot().backfill.state, 'pending', '服务未出现前应处于等待状态')
  assert.equal(plugin.snapshot().heatSeries.length, 0, '此时还没有历史')
  // 服务现在出现。
  plugin.state.pendingInject()
  await new Promise((resolve) => setTimeout(resolve, 300))
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.state, 'done', '服务出现后应完成回填（实际 ' + snap.backfill.state + '）')
  assert.ok(snap.heatSeries.some((entry) => entry.d === dayKey(noonOf(9))), '历史那天应被补上')
  await plugin.stop()
})

test('an empty corpus is not treated as complete', { concurrency: 1 }, async () => {
  // 启动早期服务刚就绪、持久化历史还没挂上来时 listSessions() 会返回空。
  // 这时**不能**标记完成，否则永远不会再试——线上首版就是这样"跑一次、什么都没补、然后放弃"。
  const plugin = await startWithHistory(undefined, [])
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.state, 'empty', '空语料应报 empty（实际 ' + snap.backfill.state + '）')
  assert.equal(snap.backfill.total, 0, '应如实上报语料总数')
  assert.equal(snap.heatBackfilled, false, '空语料不得标记为已完成')
  await plugin.stop()
})

test('a truncated run reports total and schedules a retry', { concurrency: 1 }, async () => {
  // partial 表示被时间预算截断；应带上语料总数，并安排下一次重试。
  const payload = 'x'.repeat(200)
  const sessions = Array.from({ length: 3 }, (_, index) => ({
    id: 's' + index,
    createdAt: noonOf(10 + index),
    events: [
      { type: 'request/context', time: noonOf(10 + index), data: { model: 'model-a', pad: payload } },
      { type: 'assistant/message', time: noonOf(10 + index), data: { usage: { inputTokens: 10, outputTokens: 5 } } },
    ],
  }))
  const plugin = await startWithHistory(undefined, sessions)
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.total, 3, '应上报语料总数 3（实际 ' + snap.backfill.total + '）')
  assert.equal(snap.heatSeries.length, 3, '三天都应被补上')
  await plugin.stop()
})

test('a legacy boolean completion flag no longer blocks backfill', { concurrency: 1 }, async () => {
  // 旧版本在"语料为空"时会误写 heatBackfilled: true，让历史永远补不上。
  // 完成标记改为版本号后，线上遗留的旧布尔值必须失效并重跑一轮。
  const initial = { version: 7, stats: {}, prices: {}, removed: [], heatBuckets: {}, heatBackfilled: true }
  const history = [{
    id: 's1',
    createdAt: noonOf(7),
    events: [
      { type: 'request/context', time: noonOf(7), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(7), data: { usage: { inputTokens: 1, outputTokens: 1 } } },
    ],
  }]
  const plugin = await startWithHistory(initial, history)
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.state, 'done', '旧布尔标记必须失效并重新回填（实际 ' + snap.backfill.state + '）')
  assert.equal(snap.heatSeries.length, 1, '历史应被补上')
  await plugin.stop()
})

test('backfill is skipped once marked complete', { concurrency: 1 }, async () => {
  const initial = { version: 7, stats: {}, prices: {}, removed: [], heatBuckets: {}, heatBackfillRev: 2 }
  const history = [{
    id: 's1',
    createdAt: noonOf(7),
    events: [
      { type: 'request/context', time: noonOf(7), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(7), data: { usage: { inputTokens: 1, outputTokens: 1 } } },
    ],
  }]
  const plugin = await startWithHistory(initial, history)
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.state, 'skipped', '已完成时不再扫描')
  assert.equal(plugin.readCalls.length, 0, '不应读取任何会话')
  await plugin.stop()
})

test('backfill reports unavailable when the service never appears', { concurrency: 1 }, async () => {
  // 部署没挂载 sessionQuery 时要优雅降级：等待态 → 兜底标记不可用，而不是抛错。
  const plugin = await startWithHistory(undefined, [], 'absent')
  assert.equal(plugin.snapshot().backfill.state, 'pending', '先处于等待状态')
  // 手动驱动兜底定时器（真实环境是 20 秒后触发）。
  for (const fn of plugin.state.intervalFns) fn()
  assert.equal(plugin.snapshot().backfill.state, 'unavailable', '兜底后应标记为不可用')
  await plugin.stop()
})

test('a live session event wakes backfill when the corpus was empty at boot', { concurrency: 1 }, async () => {
  // 线上现象：启动瞬间 listSessions() 返回 0，几分钟后才有 120+ 条会话。
  // 定时重试窗口有限，因此任何真实事件到达都应再唤醒一轮。
  const history = []
  const plugin = await startWithHistory(undefined, history)
  assert.equal(plugin.snapshot().backfill.state, 'empty', '空语料先记为 empty（不得标记完成）')
  // 语料就绪：会话出现，随后来了一条真实事件。
  history.push({
    id: 's9',
    createdAt: noonOf(6),
    events: [
      { type: 'request/context', time: noonOf(6), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(6), data: { usage: { inputTokens: 40, outputTokens: 2 } } },
    ],
  })
  plugin.emit({ type: 'tool/call', data: { name: 'read' } })
  await new Promise((resolve) => setTimeout(resolve, 300))
  const snap = plugin.snapshot()
  assert.equal(snap.backfill.state, 'done', '事件唤醒后应补完（实际 ' + snap.backfill.state + '）')
  assert.ok(snap.heatSeries.some((entry) => entry.d === dayKey(noonOf(6))), '历史那天应被补上')
  await plugin.stop()
})

test('the wake-up scans at most once', { concurrency: 1 }, async () => {
  const history = [{
    id: 's1',
    createdAt: noonOf(6),
    events: [
      { type: 'request/context', time: noonOf(6), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(6), data: { usage: { inputTokens: 40, outputTokens: 2 } } },
    ],
  }]
  const plugin = await startWithHistory(undefined, history)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const afterFirst = plugin.readCalls.length
  assert.ok(afterFirst > 0, '首轮应已扫描')
  // 后续事件不得再触发整库重扫（否则每个事件都要读一遍全部会话）。
  plugin.emit({ type: 'tool/call', data: { name: 'read' } })
  plugin.emit({ type: 'tool/result', data: { name: 'read' } })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(plugin.readCalls.length, afterFirst, '唤醒只允许发生一次')
  await plugin.stop()
})

// ---------- 自锁（线上实际故障） ----------

test('a hanging listSessions does not lock the backfill forever', { concurrency: 1 }, async () => {
  // 线上故障：注入得到的服务实例的 listSessions() 一直没有结果。
  // 旧实现里这次运行永远不返回，`backfillRunning` 就此为真，
  // 之后所有重试、唤醒、手动触发都直接返回旧结果——功能永久失效，重启才恢复。
  const previousTimeout = process.env.DSH_MODEL_USAGE_BACKFILL_TIMEOUT_MS
  process.env.DSH_MODEL_USAGE_BACKFILL_TIMEOUT_MS = '120'
  let calls = 0
  const history = [{
    id: 's1',
    createdAt: noonOf(6),
    events: [
      { type: 'request/context', time: noonOf(6), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(6), data: { usage: { inputTokens: 40, outputTokens: 2 } } },
    ],
  }]
  const plugin = await startWithHistory(undefined, history, 'immediate', () => {
    calls += 1
    // 第一次挂住；之后恢复正常（模拟服务稍后就绪）。
    return calls === 1 ? new Promise(() => {}) : Promise.resolve(
      history.map((s) => ({ header: { id: s.id, createdAt: s.createdAt }, live: false, persisted: true })),
    )
  })
  try {
    const first = plugin.snapshot()
    assert.equal(first.backfillDebug.running, false, '超时后必须复位运行标志（不能自锁）')
    assert.equal(first.backfill.state, 'error', '第一次超时应记为 error 而不是停在 empty')
    assert.match(String(first.backfill.message || ''), /超时/, '错误信息要指明是超时')
    // 失败也要留在重试链里：驱动重试定时器，应该能补上历史。
    for (const fn of plugin.state.intervalFns.splice(0)) fn()
    await new Promise((resolve) => setTimeout(resolve, 400))
    const after = plugin.snapshot()
    assert.equal(after.backfill.state, 'done', '重试后应完成（实际 ' + after.backfill.state + '）')
    assert.ok(after.heatSeries.some((entry) => entry.d === dayKey(noonOf(6))), '历史那天应被补上')
    assert.equal(after.backfillDebug.running, false, '结束后不得残留运行标志')
  } finally {
    if (previousTimeout === undefined) delete process.env.DSH_MODEL_USAGE_BACKFILL_TIMEOUT_MS
    else process.env.DSH_MODEL_USAGE_BACKFILL_TIMEOUT_MS = previousTimeout
    await plugin.stop()
  }
})

test('a rejecting listSessions releases the running guard', { concurrency: 1 }, async () => {
  // 抛错路径同样要复位：旧实现在抛错时不会执行复位那一行，
  // 于是标志永久为真，后续尝试全部空转。
  let calls = 0
  const history = [{
    id: 's2',
    createdAt: noonOf(5),
    events: [
      { type: 'request/context', time: noonOf(5), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(5), data: { usage: { inputTokens: 10, outputTokens: 1 } } },
    ],
  }]
  const plugin = await startWithHistory(undefined, history, 'immediate', () => {
    calls += 1
    if (calls === 1) throw new Error('transient failure')
    return Promise.resolve(history.map((s) => ({ header: { id: s.id, createdAt: s.createdAt }, live: false, persisted: true })))
  })
  try {
    assert.equal(plugin.snapshot().backfillDebug.running, false, '抛错后必须复位')
    for (const fn of plugin.state.intervalFns.splice(0)) fn()
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal(plugin.snapshot().backfill.state, 'done', '重试后应完成')
  } finally {
    await plugin.stop()
  }
})

test('the backfill resolves sessionQuery at call time instead of trusting the injected instance', { concurrency: 1 }, async () => {
  // 注入实例可能不工作而现场解析的实例正常。这里让 apply 时注入的实例恒为空，
  // 而 ctx.get 返回正常实例：回填必须用后者（否则永远补不上）。
  const history = [{
    id: 's3',
    createdAt: noonOf(4),
    events: [
      { type: 'request/context', time: noonOf(4), data: { model: 'm' } },
      { type: 'assistant/message', time: noonOf(4), data: { usage: { inputTokens: 5, outputTokens: 1 } } },
    ],
  }]
  const dead = {
    async listSessions() { return [] },
    async readSession() { throw new Error('dead instance') },
  }
  const live = {
    async listSessions() {
      return history.map((s) => ({ header: { id: s.id, createdAt: s.createdAt }, live: false, persisted: true }))
    },
    async readSession(id) {
      const found = history.find((s) => s.id === id)
      return { session: { id }, inheritedEventCount: 0, events: found.events }
    },
  }
  mkdirSync(TEMP_ROOT, { recursive: true })
  const home = mkdtempSync(join(TEMP_ROOT, 'backfill-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href + '?resolve-at-call=1')
  const state = { route: null }
  mod.apply({
    webServer: { register(options) { state.route = options; return () => {} } },
    on: () => () => {},
    timeout: () => () => {},
    interval: () => () => {},
    effect: (fn) => { fn(); return () => {} },
    // apply 阶段的注入拿到"死的"实例；ctx.get 拿到"活的"实例。
    inject: (_deps, callback) => callback({ sessionQuery: dead }),
    get: (name) => (name === 'sessionQuery' ? live : undefined),
  })
  try {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const res = { setHeader() {}, end(text) { this.body = text } }
    state.route.handler({ method: 'GET', headers: { host: '127.0.0.1:3080' } }, res)
    const snap = JSON.parse(res.body)
    assert.equal(snap.backfillDebug.source, 'ctx.get', '应记录为按调用时解析')
    assert.equal(snap.backfill.state, 'done', '必须用 ctx.get 的实例完成回填（实际 ' + snap.backfill.state + '）')
    assert.ok(snap.heatSeries.some((entry) => entry.d === dayKey(noonOf(4))), '历史那天应被补上')
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
})
