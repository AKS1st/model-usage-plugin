/**
 * 计费开关：`customPricing`（自定义计费）与 `tokenPlan`（套餐）。
 *
 * 两条硬性要求，都在这里钉住：
 * ① 开关只决定"用内置默认价还是用户自己填的价"，**来回切换不得丢数值**——用户填过
 *    的价格必须一直留在记录里。客户端切换时只发开关本身，Host 收到只有开关的请求时
 *    只改开关、不重写数值；这条链路两端各有测试。
 * ② `tokenPlan` 表示该模型由套餐覆盖，费用不该被计算（`priceOf` 返回 null）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname
const TEMP_ROOT = join(PLUGIN_ROOT, '.verify-home')

/**
 * 启动插件并给出可发 POST 的句柄。
 * @param {object} [initial] - 预置的数据文件内容。
 * @returns {Promise<{read: Function, post: Function, stop: Function}>} 句柄。
 */
async function bench(initial) {
  mkdirSync(TEMP_ROOT, { recursive: true })
  const home = mkdtempSync(join(TEMP_ROOT, 'flags-'))
  if (initial !== undefined) writeFileSync(join(home, 'musage-stats.json'), JSON.stringify(initial))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home

  const mod = await import(pathToFileURL(join(PLUGIN_ROOT, 'src/index.js')).href)
  const state = { route: null, flush: [] }
  mod.apply({
    webServer: { register(options) { state.route = options; return () => {} } },
    on: () => () => {},
    timeout: () => () => {},
    interval: (fn) => { state.flush.push(fn); return () => {} },
    get: () => undefined,
    inject: () => {},
    effect: () => () => {},
  })

  const read = () => {
    const res = { setHeader() {}, end(text) { this.body = text } }
    state.route.handler({ method: 'GET', headers: { host: '127.0.0.1:3080' } }, res)
    return JSON.parse(res.body)
  }
  const post = async (body) => {
    const res = { setHeader() {}, end(text) { this.body = text } }
    const req = {
      method: 'POST',
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' },
    }
    req[Symbol.asyncIterator] = async function* iterator() { yield Buffer.from(JSON.stringify(body)) }
    await state.route.handler(req, res)
    // 落盘走防抖：这里直接驱动待办回调，避免等定时器。
    for (const fn of state.flush.splice(0)) fn()
    return JSON.parse(res.body)
  }
  const stop = async () => {
    // 落盘是防抖的：先把待办回调驱动一遍，再读文件；从未写盘时返回空对象。
    for (const fn of state.flush.splice(0)) fn()
    const file = join(home, 'musage-stats.json')
    const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
    return saved
  }
  return { read, post, stop }
}

const USER_PRICE = {
  'gpt-5.6-luna': { currency: 'USD', input: 9.5, output: 19.5, cacheRead: 0.95, cacheWrite: 1.9 },
}

test('turning custom pricing off keeps the values the user entered', { concurrency: 1 }, async () => {
  // 这是用户明确提出的要求：勾选/取消勾选切换不得丢数据。
  const plugin = await bench({ version: 7, stats: {}, removed: [], prices: { ...USER_PRICE } })
  try {
    // 老数据里没有开关，但数值与内置默认价不同 → 判定为用户自定义。
    assert.equal(plugin.read().prices['gpt-5.6-luna'].customPricing, true, '与默认价不同应判为自定义')

    // 客户端关掉自定义计费时**只发开关**（不发表单里的数字，那正是内置默认价）。
    const off = await plugin.post({ action: 'set-price', model: 'gpt-5.6-luna', customPricing: false })
    assert.equal(off.ok, true)
    const afterOff = plugin.read().prices['gpt-5.6-luna']
    assert.equal(afterOff.input, 9.5, '关掉开关后用户填的单价必须原样保留')
    assert.equal(afterOff.output, 19.5, '关掉开关后用户填的单价必须原样保留')
    assert.notEqual(afterOff.customPricing, true, '开关应为关闭')

    // 再勾回来：数值还在，可以继续用。
    await plugin.post({ action: 'set-price', model: 'gpt-5.6-luna', customPricing: true })
    const afterOn = plugin.read().prices['gpt-5.6-luna']
    assert.equal(afterOn.customPricing, true, '开关应能勾回来')
    assert.equal(afterOn.input, 9.5, '来回切换后数值仍在')
  } finally {
    await plugin.stop()
  }
})

test('an entry equal to the built-in default is not treated as custom', { concurrency: 1 }, async () => {
  // 与内置默认价逐档相同的条目是"插件发的价"，不是用户数据；判定为自定义会让它
  // 从此不再跟随官方调价更新。
  const plugin = await bench({
    version: 7, stats: {}, removed: [],
    prices: { 'glm-5.3': { currency: 'USD', input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 } },
  })
  try {
    assert.equal(plugin.read().prices['glm-5.3'].customPricing, undefined, '等于默认价不应判为自定义')
  } finally {
    await plugin.stop()
  }
})

test('a model missing from the built-in list is custom by definition', { concurrency: 1 }, async () => {
  const plugin = await bench({
    version: 7, stats: {}, removed: [],
    prices: { 'my-own-model': { currency: 'CNY', input: 3, output: 9, cacheRead: 0.3, cacheWrite: 0 } },
  })
  try {
    // 内置价目里没有它，就没有"默认价"可用，只能按用户填的算。
    assert.equal(plugin.read().prices['my-own-model'].customPricing, true)
  } finally {
    await plugin.stop()
  }
})

test('the token plan switch persists and is exposed to the client', { concurrency: 1 }, async () => {
  const plugin = await bench({ version: 7, stats: {}, removed: [], prices: { ...USER_PRICE } })
  try {
    assert.equal(plugin.read().prices['gpt-5.6-luna'].tokenPlan, undefined, '默认不启用套餐')
    await plugin.post({ action: 'set-price', model: 'gpt-5.6-luna', tokenPlan: true })
    const price = plugin.read().prices['gpt-5.6-luna']
    assert.equal(price.tokenPlan, true, '勾选后应持久化')
    assert.equal(price.input, 9.5, '翻套餐开关也不得动数值')
    const saved = await plugin.stop()
    assert.equal(saved.prices['gpt-5.6-luna'].tokenPlan, true, '套餐开关要落盘')
    assert.equal(saved.prices['gpt-5.6-luna'].input, 9.5, '数值要落盘')
  } finally {
    // stop 已在上面的 finally 里调用过一次；重复调用是幂等的。
  }
})

test('token plan capability is marked per model, and DeepSeek is never marked', { concurrency: 1 }, async () => {
  // 勾选框只对"支持套餐"的模型显示。DeepSeek 只有充值余额、没有套餐，所以不该出现。
  const plugin = await bench(undefined)
  try {
    const presets = plugin.read().presets
    for (const id of ['gpt-5.6-luna', 'gpt-5.6-sol', 'glm-5.3', 'glm-5.3-flash', 'qwen3-max', 'claude-sonnet-4.6', 'gemini-3-flash', 'kimi-k2']) {
      assert.equal(presets[id] && presets[id].tokenPlanSupported, true, id + ' 应支持 token plan')
    }
    for (const id of ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat']) {
      assert.notEqual(presets[id] && presets[id].tokenPlanSupported, true, id + ' 不该有 token plan')
    }
  } finally {
    await plugin.stop()
  }
})

test('the official price refresh is reflected in the built-in presets', { concurrency: 1 }, async () => {
  // 2026-09-14 按官方页修正：OpenAI 三档此前少了一半，Astra/GLM 漏了缓存命中价。
  const plugin = await bench(undefined)
  try {
    const presets = plugin.read().presets
    const expect = {
      'gpt-5.6-luna': [0.2, 1.2, 0.02, 0.25],
      'gpt-5.6-terra': [2, 12, 0.2, 2.5],
      'gpt-5.6-sol': [4, 20, 0.4, 5],
      'gpt-6-astra': [10, 50, 1, 12.5],
      'glm-5.3': [1.4, 4.4, 0.26, 0],
      'glm-5.2': [1.4, 4.4, 0.26, 0],
      'glm-5.3-flash': [0.15, 0.5, 0.03, 0],
    }
    for (const [id, [input, output, cacheRead, cacheWrite]] of Object.entries(expect)) {
      const p = presets[id]
      assert.ok(p, id + ' 应有内置价')
      assert.equal(p.input, input, id + '.input')
      assert.equal(p.output, output, id + '.output')
      assert.equal(p.cacheRead, cacheRead, id + '.cacheRead（漏掉缓存命中价会高估费用）')
      assert.equal(p.cacheWrite || 0, cacheWrite, id + '.cacheWrite')
    }
    // DeepSeek 官方值不变，且不再有改道规则。
    assert.equal(presets['deepseek-v4-pro'].input, 4.5, 'V4-Pro 保持自己的价格')
    assert.equal(presets['deepseek-v4-pro'].rerouteFrom, undefined, '改道规则已被官方推翻，应已删除')
  } finally {
    await plugin.stop()
  }
})

test('pinning a pricing provider keeps the numbers untouched', { concurrency: 1 }, async () => {
  // 同名不同源（glm-5.1 在阿里云 vs Z.AI 单价不同）靠"计价来源"区分：
  // 固定来源同样只发这一个字段，不能碰任何单价。
  const plugin = await bench({ version: 7, stats: {}, removed: [], prices: { ...USER_PRICE } })
  try {
    await plugin.post({ action: 'set-price', model: 'gpt-5.6-luna', provider: 'openrouter' })
    const pinned = plugin.read().prices['gpt-5.6-luna']
    assert.equal(pinned.provider, 'openrouter', '应记住固定的 provider')
    assert.equal(pinned.input, 9.5, '固定来源不得改动单价')
    // 传空串即恢复自动判定。
    await plugin.post({ action: 'set-price', model: 'gpt-5.6-luna', provider: '' })
    assert.equal(plugin.read().prices['gpt-5.6-luna'].provider, undefined, '空串应恢复自动')
    assert.equal(plugin.read().prices['gpt-5.6-luna'].input, 9.5, '恢复自动也不得改动单价')
  } finally {
    await plugin.stop()
  }
})

test('a provider override price is stored per provider and leaves the base price alone', { concurrency: 1 }, async () => {
  const plugin = await bench({ version: 7, stats: {}, removed: [], prices: { ...USER_PRICE } })
  try {
    await plugin.post({
      action: 'set-price', model: 'gpt-5.6-luna',
      price: { providerId: 'openrouter', currency: 'USD', input: 1.23, output: 4.56, cacheRead: 0.1, cacheWrite: 0 },
    })
    const price = plugin.read().prices['gpt-5.6-luna']
    assert.ok(price.providers && price.providers.openrouter, '应写入 providers 覆盖')
    assert.equal(price.providers.openrouter.input, 1.23, '覆盖价应写进该 provider')
    assert.equal(price.input, 9.5, '基础价必须保持不变')
    const saved = await plugin.stop()
    assert.equal(saved.prices['gpt-5.6-luna'].providers.openrouter.output, 4.56, '覆盖价要落盘')
  } finally {
    // stop 已在上面调用
  }
})

test('an explicit token plan opt-out survives a restart', { concurrency: 1 }, async () => {
  // tokenPlan 是三态：缺省跟随 provider 的自动规则（订阅型默认算套餐），
  // 但用户明确说"不"时必须一直算数，否则重启后又会被自动打开。
  const plugin = await bench({ version: 7, stats: {}, removed: [], prices: { ...USER_PRICE } })
  try {
    await plugin.post({ action: 'set-price', model: 'gpt-5.6-luna', tokenPlan: false })
    const saved = await plugin.stop()
    assert.equal(saved.prices['gpt-5.6-luna'].tokenPlan, false, 'false 必须落盘（不能当成缺省丢掉）')
  } finally {
    // stop 已调用
  }
})

test('the snapshot ships the subscription provider list', { concurrency: 1 }, async () => {
  const plugin = await bench(undefined)
  try {
    const list = plugin.read().subscriptionProviders
    assert.ok(Array.isArray(list), '应下发订阅型 provider 名单')
    assert.ok(list.includes('openai-codex'), 'Codex 订阅应在名单里：' + JSON.stringify(list))
  } finally {
    await plugin.stop()
  }
})
