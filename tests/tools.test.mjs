import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname
const TEMP_ROOT = join(PLUGIN_ROOT, '.verify-home')

// 把写盘防抖压到 60ms：否则每个用例都要等满 4 秒的防抖窗口。
process.env.DSH_MODEL_USAGE_FLUSH_MS = '60'

/**
 * 启动插件并暴露 llm/stream 与 session/event 两个入口。
 * @returns {Promise<{callLlm: Function, toolCall: Function, toolResult: Function, snapshot: Function, stop: Function}>}
 */
async function startPlugin() {
  mkdirSync(TEMP_ROOT, { recursive: true })
  const home = mkdtempSync(join(TEMP_ROOT, 'tools-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home

  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href)
  const state = { stream: null, session: null, route: null, intervals: [], dispose: [] }
  mod.apply({
    webServer: { register(options) { state.route = options; return () => {} } },
    on: (event, handler) => {
      if (event === 'llm/stream') state.stream = handler
      if (event === 'session/event') state.session = handler
      if (event === 'dispose') state.dispose.push(handler)
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

  /** 模拟一次带 sessionId 的流式调用（工具归因依赖它）。 */
  const callLlm = async (model, sessionId, usage) => {
    const upstream = (async function* () {
      yield { type: 'text', text: 'x' }
      yield { type: 'usage', usage }
    })()
    const wrapped = state.stream({ provider: 'test', model, sessionId }, () => upstream)
    for await (const _chunk of wrapped) { /* 消费完触发采集 */ }
  }

  const toolCall = (sessionId, name) => state.session({ id: sessionId }, { type: 'tool/call', data: { name } })
  const toolResult = (sessionId, name, error) => state.session(
    { id: sessionId },
    { type: 'tool/result', data: error === undefined ? { name } : { name, error } },
  )

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

  return { callLlm, toolCall, toolResult, snapshot, stop }
}

test('tool calls are counted once per call, not once per call+result', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('deepseek-flash', 's1', { inputTokens: 1000, outputTokens: 100 })
  plugin.toolCall('s1', 'read')
  plugin.toolResult('s1', 'read')
  plugin.toolCall('s1', 'read')
  plugin.toolResult('s1', 'read')

  const today = plugin.snapshot().daySeries.at(-1)
  // 一次工具调用会产生 tool/call 与 tool/result 两个事件；两边都计数会把结果翻倍。
  assert.equal(today.toolCalls, 2, '两次工具调用应计为 2')
  assert.equal(today.tools.read.calls, 2, '按工具名也只计 2 次')
  await plugin.stop()
})

test('tool failures come from tool/result error payloads', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('deepseek-flash', 's1', { inputTokens: 100, outputTokens: 10 })
  plugin.toolCall('s1', 'edit')
  plugin.toolResult('s1', 'edit', { message: 'boom' })
  plugin.toolCall('s1', 'edit')
  plugin.toolResult('s1', 'edit')

  const today = plugin.snapshot().daySeries.at(-1)
  assert.equal(today.toolCalls, 2)
  assert.equal(today.toolFailed, 1, '只有带 error 的结果算失败')
  assert.equal(today.tools.edit.calls, 2)
  assert.equal(today.tools.edit.failed, 1, '失败数记在对应工具名下')
  await plugin.stop()
})

test('tool calls are attributed to the session last model', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('model-a', 's1', { inputTokens: 10, outputTokens: 1 })
  plugin.toolCall('s1', 'read')
  // 同一会话切到另一个模型后再调用工具：应归到新模型。
  await plugin.callLlm('model-b', 's1', { inputTokens: 10, outputTokens: 1 })
  plugin.toolCall('s1', 'grep')

  const today = plugin.snapshot().daySeries.at(-1)
  assert.equal(today.byModel['model-a'].tc, 1, '切换前的工具调用归前一个模型')
  assert.equal(today.byModel['model-b'].tc, 1, '切换后的工具调用归新模型')
  await plugin.stop()
})

test('tool calls without a known session fall back to the unknown bucket', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  // 没有任何 LLM 调用记录时，工具事件仍要被计入总量（宁可有归属不明的计数，
  // 也不要静默丢掉）。
  plugin.toolCall('never-seen', 'bash')
  const today = plugin.snapshot().daySeries.at(-1)
  assert.equal(today.toolCalls, 1)
  assert.equal(today.byModel.unknown.tc, 1)
  await plugin.stop()
})

test('tool metrics persist across a restart', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('deepseek-flash', 's1', { inputTokens: 100, outputTokens: 10 })
  plugin.toolCall('s1', 'read')
  plugin.toolResult('s1', 'read', { message: 'nope' })
  const saved = await plugin.stop()
  const day = Object.values(saved.dayBuckets)[0]
  assert.equal(day.models['deepseek-flash'].toolCalls, 1)
  assert.equal(day.models['deepseek-flash'].toolFailed, 1)
  assert.equal(day.tools.read.calls, 1)
  assert.equal(day.tools.read.failed, 1)
})

test('the heat ledger keeps one compact record per day', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('deepseek-flash', 's1', { inputTokens: 1000, cacheReadTokens: 2000, outputTokens: 500 })
  plugin.toolCall('s1', 'read')
  const snap = plugin.snapshot()
  const heat = snap.heatSeries
  assert.equal(heat.length, 1, '只应有今天一条')
  // 与趋势图同口径：输入 + 缓存读/写 + 输出；工具调用单独一个标量。
  assert.equal(heat[0].t, 3500, 'tokens 聚合')
  assert.equal(heat[0].k, 1, '工具调用聚合')
  assert.match(heat[0].d, /^\d{4}-\d{2}-\d{2}$/, '日期键格式')
  // 每天只有两个数——这是它能覆盖 53 周而不撑大 payload 的原因。
  assert.deepEqual(Object.keys(heat[0]).sort(), ['d', 'k', 't'])
  await plugin.stop()
})

test('the heat ledger is separate from the detailed buckets', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('deepseek-flash', 's1', { inputTokens: 10, outputTokens: 5 })
  plugin.toolCall('s1', 'read')
  const saved = await plugin.stop()
  // 明细台账带逐模型/逐工具信息；热力账只有标量。两者不能混用，否则长期保留会爆。
  const day = saved.dayBuckets[Object.keys(saved.dayBuckets)[0]]
  assert.ok(day.models['deepseek-flash'], '明细台账有逐模型信息')
  const heat = saved.heatBuckets[Object.keys(saved.heatBuckets)[0]]
  assert.deepEqual(Object.keys(heat).sort(), ['tokens', 'tools'])
  assert.equal(heat.tokens, 15)
  assert.equal(heat.tools, 1)
})

test('tool name tally is bounded per bucket', { concurrency: 1 }, async () => {
  const plugin = await startPlugin()
  await plugin.callLlm('deepseek-flash', 's1', { inputTokens: 10, outputTokens: 1 })
  // 上限是 MAX_TOOL_NAMES=16：塞 30 个不同工具名，只应留下最高频的那些。
  for (let index = 0; index < 30; index += 1) {
    const repetitions = 1 + (index % 5)
    for (let n = 0; n < repetitions; n += 1) plugin.toolCall('s1', 'tool-' + index)
  }
  const today = plugin.snapshot().daySeries.at(-1)
  assert.ok(Object.keys(today.tools).length <= 16, '工具名数量应有界（实际 ' + Object.keys(today.tools).length + '）')
  // 总量不受工具名裁剪影响：按模型计的数字仍然完整。
  const expected = Array.from({ length: 30 }, (_, index) => 1 + (index % 5)).reduce((a, b) => a + b, 0)
  assert.equal(today.byModel['deepseek-flash'].tc, expected, '裁剪工具名不该影响调用总数')
  await plugin.stop()
})
