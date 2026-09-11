import { test } from 'node:test'
import assert from 'node:assert/strict'
import { internals } from '../src/index.js'

const { presetFor, normalizeModelId, inPeak, inPeakWindow, PRESET_PRICES, LEGACY_PRESET_PRICES } = internals

// DeepSeek 于 2026-09-10 发布 DeepSeek-V4.1-Flash，官方模型名为 `deepseek-flash`；
// V4 Flash、V4 Flash Vision Exp 下线并由旧 id 临时别名路由到 V4.1 Flash，按 Flash
// 价计费；V4 Pro 自 2026-09-14 04:00 UTC 起同样路由到 Flash。以下断言把这份官方
// 口径钉住：空闲价 CNY / 百万 tokens，高峰价 = 空闲价 × 2。
const OFFICIAL_FLASH = { currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0 }

test('V4.1 Flash compatibility ids share the Flash price', () => {
  // 这些 id 都已由 V4.1 Flash 提供服务并按 Flash 价计费（官方定价页脚注 1）。
  const ids = [
    'deepseek-flash',
    'deepseek-v4-flash',
    'deepseek-v4-flash-0731',
    'deepseek-v4-flash-vision-exp',
    'deepseek-flash-vision-exp',
    // 第三方网关 slug 与 provider 限定形式。
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4.1-flash-beta',
    'deepseek-v4.1-flash',
    'deepseek-official/deepseek-flash',
  ]
  for (const id of ids) {
    assert.equal(normalizeModelId(id), 'deepseek-flash', `${id} should normalize to deepseek-flash`)
    const price = presetFor(id)
    assert.ok(price, `${id} should have a price preset`)
    for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
      assert.equal(price[field], OFFICIAL_FLASH[field], `${id}.${field}`)
    }
    assert.equal(price.currency, 'CNY', `${id}.currency`)
  }
})

test('V4 Pro keeps its own price until the documented reroute date', () => {
  // 官方定价页脚注 2：北京时间 2026-09-14 12:00（04:00 UTC）之后，deepseek-v4-pro 的
  // 请求才全部路由到 V4.1 Flash 并按 Flash 价计费。**在那之前它仍是独立的 V4-Pro-0813**，
  // 有独立的价格与统计——把它当成 Flash 的别名会同时错算金额和合并统计。
  const officialPro = { currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0 }
  for (const id of ['deepseek-v4-pro', 'deepseek-v4-pro-0813']) {
    assert.equal(normalizeModelId(id), id, id + ' 不应被折叠成 Flash')
    const price = presetFor(id)
    assert.ok(price, id + ' 应有自己的价格')
    for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
      assert.equal(price[field], officialPro[field], id + '.' + field)
    }
    // 改路由必须以"时点规则"表达，而不是把价格直接改成 Flash 价。
    assert.equal(price.rerouteFrom, '2026-09-14T04:00:00Z', id + '.rerouteFrom')
    assert.equal(price.rerouteTo, 'deepseek-flash', id + '.rerouteTo')
  }
})

test('V4.1 Flash peak price is exactly twice the off-peak price', () => {
  const price = presetFor('deepseek-flash')
  assert.equal(price.peak.enabled, true)
  assert.equal(price.peak.input, OFFICIAL_FLASH.input * 2)
  assert.equal(price.peak.output, OFFICIAL_FLASH.output * 2)
  assert.equal(price.peak.cacheRead, OFFICIAL_FLASH.cacheRead * 2)
  // 官方未公布 cache write 费用。
  assert.equal(price.peak.cacheWrite, 0)
})

test('peak windows are the official UTC windows on weekdays only', () => {
  const price = presetFor('deepseek-flash')
  assert.deepEqual(
    { start: price.peak.start, end: price.peak.end },
    { start: '01:00', end: '04:00' },
  )
  assert.deepEqual(
    { enabled: price.peak2.enabled, start: price.peak2.start, end: price.peak2.end },
    { enabled: true, start: '06:00', end: '10:00' },
  )
  // 高峰窗口显式锚定 UTC 与周一至周五，不依赖运行机器的时区。
  for (const window of [price.peak, price.peak2]) {
    assert.equal(window.timezone, 'UTC')
    assert.deepEqual(window.weekdays, [1, 2, 3, 4, 5])
  }
})

test('peak billing follows UTC clock boundaries, not the host timezone', () => {
  const price = presetFor('deepseek-flash')
  // 2026-09-10 是周四，2026-09-12 / 13 是周六 / 周日。
  const cases = [
    // [ISO 时刻, 是否高峰, 说明]
    ['2026-09-10T00:59:00Z', false, '窗口 A 开始前'],
    ['2026-09-10T01:00:00Z', true, '窗口 A 起点含入'],
    ['2026-09-10T03:59:00Z', true, '窗口 A 内'],
    ['2026-09-10T04:00:00Z', false, '窗口 A 终点排除'],
    ['2026-09-10T05:59:00Z', false, '两窗口之间的空闲段'],
    ['2026-09-10T06:00:00Z', true, '窗口 B 起点含入'],
    ['2026-09-10T09:59:00Z', true, '窗口 B 内'],
    ['2026-09-10T10:00:00Z', false, '窗口 B 终点排除'],
    ['2026-09-10T23:00:00Z', false, '窗口外'],
    ['2026-09-12T02:00:00Z', false, '周六全天空闲'],
    ['2026-09-13T08:00:00Z', false, '周日全天空闲'],
  ]
  for (const [iso, expected, label] of cases) {
    assert.equal(inPeak(price, new Date(iso)), expected, `${iso} (${label})`)
  }
})

test('a peak window without weekdays applies every day', () => {
  const window = { enabled: true, start: '01:00', end: '04:00', timezone: 'UTC' }
  assert.equal(inPeakWindow(window, new Date('2026-09-12T02:00:00Z')), true, 'Saturday should still be peak')
})

test('a peak window honours an explicit non-UTC timezone', () => {
  // Asia/Shanghai = UTC+8，官方北京时间窗口 09:00–12:00 等价于 UTC 01:00–04:00。
  const window = { enabled: true, start: '09:00', end: '12:00', timezone: 'Asia/Shanghai' }
  assert.equal(inPeakWindow(window, new Date('2026-09-10T02:00:00Z')), true)
  assert.equal(inPeakWindow(window, new Date('2026-09-10T05:00:00Z')), false)
})

test('an invalid or empty peak window never bills at peak rates', () => {
  const price = { peak: { enabled: true, start: '', end: '', timezone: 'UTC' } }
  assert.equal(inPeak(price, new Date('2026-09-10T02:00:00Z')), false)
  assert.equal(inPeak({ peak: { enabled: false, start: '01:00', end: '04:00' } }, new Date('2026-09-10T02:00:00Z')), false)
  assert.equal(inPeak({ peak: { enabled: true, start: '01:00', end: '01:00' } }, new Date('2026-09-10T02:00:00Z')), false)
  assert.equal(inPeak(undefined, new Date('2026-09-10T02:00:00Z')), false)
})

test('a peak window spanning midnight stays active after 22:00', () => {
  const window = { enabled: true, start: '22:00', end: '06:00', timezone: 'UTC' }
  assert.equal(inPeakWindow(window, new Date('2026-09-10T23:30:00Z')), true)
  assert.equal(inPeakWindow(window, new Date('2026-09-10T05:30:00Z')), true)
  assert.equal(inPeakWindow(window, new Date('2026-09-10T12:00:00Z')), false)
})

test('retired chat/reasoner ids keep their last billed price for reconciliation', () => {
  // 两个 id 于 2026-07-24 停用，官方定价页已不再列出；保留最后一段计费口径，
  // 让历史统计仍能算出金额，而不是显示"未配置价格"。
  for (const id of ['deepseek-chat', 'deepseek-reasoner']) {
    const price = presetFor(id)
    assert.ok(price, `${id} should keep a price entry`)
    assert.equal(price.currency, 'CNY')
  }
})

test('unrelated models are unaffected by the DeepSeek alias table', () => {
  assert.equal(normalizeModelId('glm-5.1'), 'glm-5.1')
  assert.equal(normalizeModelId('z-ai/glm-5.3-flash'), 'glm-5.3-flash')
  assert.equal(normalizeModelId('gpt-5.6-sol'), 'gpt-5.6-sol')
  assert.equal(presetFor('gpt-5.6-sol').currency, 'USD')
})

test('known preset tables stay internally consistent', () => {
  for (const [model, price] of Object.entries(PRESET_PRICES)) {
    assert.ok(price.currency, `${model} needs a currency`)
    // 高峰价若配置了就必须是正常价的 2 倍（官方口径 peak = off-peak × 2）。
    for (const window of [price.peak, price.peak2]) {
      if (!window || window.enabled !== true) continue
      assert.equal(window.timezone, 'UTC', `${model} peak window should pin a timezone`)
      for (const field of ['input', 'output', 'cacheRead']) {
        if (window[field] > 0) {
          assert.equal(window[field], price[field] * 2, `${model}.peak.${field} should be 2x`)
        }
      }
    }
  }
})

test('historical default prices never collide with the current presets', () => {
  // 迁移靠"基础价等于某个历史默认价"来区分用户自定义价；若历史价与现价相同，
  // 迁移就成了无声覆盖，因此这里把两者必须不同钉死。
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
