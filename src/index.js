/**
 * model-usage-plugin — node half.
 *
 * 模型消耗统计（静态插件）：拦截每次流式模型调用（llm/stream 瀑布流），
 * 按模型 id 聚合 tokens 消耗（区分缓存命中/未命中/写入），内置主流模型
 * 默认预设价（国产 CNY / 海外 USD），通过在线汇率 API 换算为目标货币。
 *
 * 持久化：统计、价格、目标货币写入 $DSH_HOME/musage-stats.json
 * （临时文件 + rename 原子替换），进程重启后自动恢复。
 *
 * 对外通道：webServer 注册 /__musage-stats 路由（GET 快照 / POST 操作），
 * 浏览器端 client 半部通过 fetch 调用。
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isLoopbackRequest, parseJsonRequest } from './route-security.js'

// 插件版本：从 package.json 读取（唯一真源）。随快照下发，让界面能自证
// "当前跑的是哪一版"——重启没生效时这是唯一能从界面上看出来的线索。
const PLUGIN_VERSION = (() => {
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
    return JSON.parse(readFileSync(file, 'utf8')).version || 'unknown'
  } catch {
    return 'unknown'
  }
})()

export const name = 'model-usage-plugin'
// webServer 和 timer 由 web 组合提供；声明为硬依赖使 apply 等待它们就绪，
// 路由和持久化定时器都随插件生命周期建立与清理。
export const inject = ['webServer', 'timer']

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD', 'CAD']
// 各货币相对 USD 的通常汇率（在线查询失败时的默认值，1 USD = X）。
const DEFAULT_RATES = { USD: 1, CNY: 7.15, EUR: 0.92, GBP: 0.79, JPY: 149, HKD: 7.8, AUD: 1.5, CAD: 1.37 }

// 峰谷判定用的时区换算：官方窗口以 UTC 定义，用户也可切到任意 IANA 时区。
// 用 'en-US' 是因为其 hour12:false 输出是稳定的 "HH:MM"；'en-GB' 输出 "24:00"
// 表示午夜，解析后得 1440 会落到下一个窗口。
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const timeZoneFormatters = new Map()

// 时间台账：按天与小时聚合每个模型的 token 与费用构成，供趋势图使用。
// 只累加"自本功能上线后"的增量，不做历史回填。保留窗口随数据自然老化，
// 由 MAX_DAYS / MAX_HOURS 约束条目数，避免文件无限增长。
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MAX_DAYS = 120
const MAX_HOURS = 26
// 快照下发的最近天数，以及其中带 byModel 明细的天数。趋势图只画最近一段，
// 磁盘上保留 MAX_DAYS 是为了日后再放大窗口，不该让每次轮询都传满保留期。
const SERIES_SNAPSHOT_DAYS = 45
const SERIES_DETAIL_DAYS = 32
// 台账里的模型数上限：按 token 量淘汰，防止大量一次性模型把文件撑大。
const MAX_BUCKET_MODELS = 24
// 单个模型在台账里累加的计数字段（与 stats 行同名，便于前端复用同一套读法）。
// toolCalls / toolFailed 来自 session/event 的 tool/call 与 tool/result，按会话的
// 最近模型归因，因此可以和 token、费用放在同一张图上比较。
const BUCKET_FIELDS = [
  'calls', 'failed',
  'inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens',
  'peakInputTokens', 'peakCacheReadTokens', 'peakCacheWriteTokens', 'peakOutputTokens',
  'toolCalls', 'toolFailed',
]

// 桶内按工具名统计的调用数上限：只留最高频的几个，避免工具名把文件撑大。
const MAX_TOOL_NAMES = 16

// 热力图专用台账：**每天只存两个数**（token、工具调用），保留 53 周。
// 不复用 dayBuckets：那里每天存着逐模型与逐工具的明细，铺 371 个格子会让 payload
// 与磁盘都膨胀一个数量级；热力图只需要一个标量。
const MAX_HEAT_DAYS = 371
// 快照里只下发有活动的日子（缺席即 0），进一步压小体积。


/** 规范化星期集合：接受 0–6（0 = 周日）数组；缺失/非法返回 undefined（= 每天）。 */
function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return undefined
  const days = []
  for (const raw of value) {
    const day = Number(raw)
    if (Number.isInteger(day) && day >= 0 && day <= 6 && !days.includes(day)) days.push(day)
  }
  return days.length ? days.sort((a, b) => a - b) : undefined
}

/** 高峰窗口时区：仅接受 UTC 或当前运行时认识的 IANA 名称；缺失/非法按 UTC 解释。 */
function normalizeTimezone(value) {
  const zone = String(value || '').trim()
  if (zone === '') return 'UTC'
  if (zone.toUpperCase() === 'UTC') return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    // 时区名不被当前 Node 的 ICU 识别：按 UTC 解释，避免静默丢弃高峰判定。
    return 'UTC'
  }
}

/**
 * 把一个工具的调用计数累加进桶（含失败数），并按调用量裁剪工具名数量。
 * @param {object} bucket - 目标桶（就地修改）。
 * @param {string} tool - 工具名。
 * @param {boolean} failed - 该次调用是否失败。
 * @returns {void}
 */
function addToolToBucket(bucket, tool, failed, countCall) {
  const name = String(tool || 'unknown')
  const entry = bucket.tools[name] || (bucket.tools[name] = { calls: 0, failed: 0 })
  // 一次调用会有 tool/call 与 tool/result 两个事件：前者计调用数，
  // 后者只补失败数，两边都加会把调用数算成两倍。
  if (countCall) entry.calls += 1
  if (failed) entry.failed += 1
  const names = Object.keys(bucket.tools)
  if (names.length > MAX_TOOL_NAMES) {
    names.sort((a, b) => (bucket.tools[b].calls || 0) - (bucket.tools[a].calls || 0))
    for (const drop of names.slice(MAX_TOOL_NAMES)) delete bucket.tools[drop]
  }
}

/**
 * 把一段会话事件聚合成"按本地日"的用量。**纯函数**，与 ctx 无关，便于离线单测。
 *
 * 三个必须注意的点：
 * ① 只统计**本会话自有**的事件——fork 出来的会话会带上父会话的事件，
 *    调用方需先按 `inheritedEventCount` 切掉，否则同一批用量会被算两次。
 * ② 模型来自 `request/context`（直接带 provider/model）或 `request/header`，
 *    之后沿用"最近一次"值，与实时采集的归因口径一致。
 * ③ 工具调用只在 `tool/call` 计数、失败只在 `tool/result` 带 error 时计数——
 *    与实时路径同一个坑（两边都加会翻倍）。
 *
 * @param {Array<{type: string, time: number, data?: object}>} events - 本会话自有的事件，按 seq 升序。
 * @param {(time: number) => string} dayKeyOfTime - 事件时间戳 → 本地日键。
 * @returns {Map<string, {tokens: number, tools: number, toolFailed: number, models: Map<string, object>}>} 按日聚合。
 */
export function aggregateSessionEvents(events, dayKeyOfTime) {
  const days = new Map()
  let model = 'unknown'
  for (const event of events) {
    if (!event || typeof event.type !== 'string') continue
    const data = event.data || {}
    if (event.type === 'request/context' && typeof data.model === 'string' && data.model !== '') {
      model = data.model
      continue
    }
    if (event.type === 'request/header') {
      const headerModel = data.header && data.header.config ? data.header.config.model : undefined
      if (typeof headerModel === 'string' && headerModel !== '') model = headerModel
      continue
    }
    const dayKey = dayKeyOfTime(event.time)
    if (event.type === 'assistant/message') {
      const usage = data.usage
      if (!usage) continue
      const entry = days.get(dayKey) || { tokens: 0, tools: 0, toolFailed: 0, models: new Map() }
      const tokens = (usage.inputTokens || 0) + (usage.cacheReadTokens || 0)
        + (usage.cacheWriteTokens || 0) + (usage.outputTokens || 0)
      entry.tokens += tokens
      const perModel = entry.models.get(model) || { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, toolCalls: 0, toolFailed: 0 }
      perModel.calls += 1
      perModel.inputTokens += usage.inputTokens || 0
      perModel.cacheReadTokens += usage.cacheReadTokens || 0
      perModel.cacheWriteTokens += usage.cacheWriteTokens || 0
      perModel.outputTokens += usage.outputTokens || 0
      perModel.reasoningTokens += usage.reasoningTokens || 0
      entry.models.set(model, perModel)
      days.set(dayKey, entry)
      continue
    }
    if (event.type === 'tool/call') {
      const entry = days.get(dayKey) || { tokens: 0, tools: 0, toolFailed: 0, models: new Map() }
      entry.tools += 1
      const perModel = entry.models.get(model) || { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, toolCalls: 0, toolFailed: 0 }
      perModel.toolCalls += 1
      entry.models.set(model, perModel)
      days.set(dayKey, entry)
      continue
    }
    if (event.type === 'tool/result' && data.error !== undefined && data.error !== null) {
      const entry = days.get(dayKey) || { tokens: 0, tools: 0, toolFailed: 0, models: new Map() }
      entry.toolFailed += 1
      const perModel = entry.models.get(model) || { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, toolCalls: 0, toolFailed: 0 }
      perModel.toolFailed += 1
      entry.models.set(model, perModel)
      days.set(dayKey, entry)
    }
  }
  return days
}

/** 本地日历日 `YYYY-MM-DD`（时间台账按用户本地日期分桶）。 */
function dayKeyOf(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

/** 本地整点键 `YYYY-MM-DDTHH`。 */
function hourKeyOf(date) {
  return dayKeyOf(date) + 'T' + String(date.getHours()).padStart(2, '0')
}

/**
 * 建一个空的聚合桶（按模型的计数容器）。
 * @returns {{ models: Record<string, object> }} 空桶。
 */
function makeBucket() {
  // tools 是按工具名的计数（与 models 正交：一个桶里同一工具可被多个模型调用）。
  return { models: {}, tools: {} }
}

/**
 * 把一个模型的用量累加进聚合桶。
 * @param {object} bucket - 目标桶（就地修改）。
 * @param {string} model - 模型 id。
 * @param {object} delta - 计数字段增量；`model` 非空时按模型累加，否则只计入 `$total`。
 * @returns {void}
 */
function addToBucket(bucket, model, delta) {
  const target = bucket.models[model] || (bucket.models[model] = {})
  for (const field of BUCKET_FIELDS) {
    const value = delta[field]
    if (value) target[field] = (target[field] || 0) + value
  }
  // 每个桶自己的合计：前端画堆叠柱时不必把所有模型再加一遍。
  const total = bucket.models.$total || (bucket.models.$total = {})
  for (const field of BUCKET_FIELDS) {
    const value = delta[field]
    if (value) total[field] = (total[field] || 0) + value
  }
}

/**
 * 桶内模型数超限时按 token 量淘汰，保留 `$total` 与用量最大的若干模型。
 * @param {object} bucket - 目标桶（就地修改）。
 * @returns {void}
 */
function pruneBucket(bucket) {
  const names = Object.keys(bucket.models).filter((name) => name !== '$total')
  if (names.length <= MAX_BUCKET_MODELS) return
  const tokensOf = (name) => {
    const entry = bucket.models[name]
    return (entry.inputTokens || 0) + (entry.cacheReadTokens || 0) + (entry.cacheWriteTokens || 0)
      + (entry.outputTokens || 0) + (entry.reasoningTokens || 0)
  }
  names.sort((a, b) => tokensOf(b) - tokensOf(a))
  for (const name of names.slice(MAX_BUCKET_MODELS)) delete bucket.models[name]
}

/**
 * 按 MAX_DAYS / MAX_HOURS 裁剪时间台账，丢弃最老的桶。
 * @param {Map<string, object>} table - 日期或小时台账（就地修改）。
 * @param {number} limit - 保留的最大条目数。
 * @returns {void}
 */
function trimBuckets(table, limit) {
  if (table.size <= limit) return
  const keys = Array.from(table.keys()).sort()
  for (const key of keys.slice(0, keys.length - limit)) table.delete(key)
}

/**
 * 把某一时刻换算到指定时区，得到当地星期与「当天分钟数」。 * @param {string} timeZone - IANA 时区名；'UTC' 或非法值按 UTC 处理。
 * @param {Date} date - 待换算的时刻。
 * @returns {{ weekday: number, minute: number } | null} 换算结果；时区非法时返回 null。
 */
function zonedClock(timeZone, date) {
  const zone = normalizeTimezone(timeZone)
  let formatter = timeZoneFormatters.get(zone)
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      // 时区名不被当前 Node 的 ICU 识别：按 UTC 解释，避免静默丢弃高峰判定。
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    }
    timeZoneFormatters.set(zone, formatter)
  }
  const parts = formatter.formatToParts(date)
  let weekday = null
  let hour = null
  let minute = null
  for (const part of parts) {
    if (part.type === 'weekday') weekday = WEEKDAY_INDEX[part.value] ?? null
    else if (part.type === 'hour') hour = Number(part.value)
    else if (part.type === 'minute') minute = Number(part.value)
  }
  if (weekday === null || !Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return { weekday, minute: (hour % 24) * 60 + minute }
}

// 官方峰谷时段（UTC，周一至周五）。DeepSeek 用 UTC 定义高峰窗口，且 2026-08-23
// 起周末全天不计高峰；预设显式锚定 UTC 与工作日，不依赖 DSH 所在机器的时区。
const PEAK_UTC = { timezone: 'UTC', weekdays: [1, 2, 3, 4, 5] }
const PEAK_A = { start: '01:00', end: '04:00' }
const PEAK_B = { start: '06:00', end: '10:00' }

/**
 * 构造 DeepSeek 官方峰谷价格配置：空闲价为正常价，高峰价为正常价的 2 倍
 * （官方口径 peak = off-peak × 2），两个高峰窗口共用同一组高峰价。
 * @param {{ input: number, output: number, cacheRead: number }} offPeak - 空闲时段单价（CNY / 百万 tokens）。
 * @returns {object} 可供价格表展开的 peak / peak2 字段。
 */
function deepSeekPeak(offPeak) {
  return {
    peak: { enabled: true, ...PEAK_A, ...PEAK_UTC, input: offPeak.input * 2, output: offPeak.output * 2, cacheRead: offPeak.cacheRead * 2, cacheWrite: 0 },
    peak2: { enabled: true, ...PEAK_B, ...PEAK_UTC },
  }
}

// 默认预设的版本号。启动迁移据此区分「插件发版的时段」与「用户手填的时段」：
// 价格对象带 presetRev 说明它是某个版本的默认预设，可以放心升级；没有该字段
// （或基础价等于历史默认价）才按旧数据的启发式判断。每次官方调价或峰谷口径
// 变化都要递增它。
const PRESET_REV = 4

// 低于该状态版本的数据才会跑一次默认价迁移。v5 引入了 presetRev 机制，
// 之后的价格口径变化靠 PRESET_REV 递增来驱动。
const PRESET_STATE_VERSION = 5

// 历代默认预设的高峰窗口签名（时区 + 星期 + 时段）。用于识别停留在旧版默认
// 窗口上的价格，其中 rev 3 及以上才记录 timezone/weekdays。窗口之间用 ; 分隔。
const PEAK_WINDOW_SIGNATURES = new Map([
  // v1：2026-08-17 峰谷计费上线，按服务器本地时间，无工作日限制。
  ['09:00-12:00;14:00-18:00', 1],
  // v2：2026-09-10 起按官方 UTC 定义锚定，并限定周一至周五。
  ['UTC/[1,2,3,4,5]/01:00-04:00;UTC/[1,2,3,4,5]/06:00-10:00', PRESET_REV],
])

// 主流模型默认预设价（元/百万 tokens）。国产模型（DeepSeek/通义/Kimi/智谱）
// 按国内价格以 CNY 计价，海外模型（OpenAI/Anthropic/Gemini）按美元计价。
// 国产模型 CNY 数值 = 美元参考价 × 7.15（通常汇率）折算。
//
// DeepSeek 口径（2026-09-10 官方定价页）：V4.1-Flash 发布后官方模型名为
// `deepseek-flash`，空闲价 ¥1 / ¥4 / ¥0.02（缓存未命中 / 输出 / 缓存命中），
// 高峰价为 2 倍；cache write 官方未公布费用。旧 id 均为兼容别名，见 MODEL_ALIASES。
const PRESET_PRICES = {
  // DeepSeek（国产，CNY 元 / 百万 tokens）
  // `deepseek-flash` 即 DeepSeek-V4.1-Flash（2026-09-10 发布），当前官方主推模型。
  'deepseek-flash': {
    currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0,
    ...deepSeekPeak({ input: 1, output: 4, cacheRead: 0.02 }),
  },
  // V4 Flash（0731）已下线，官方保留旧 id 作为临时别名并路由到 V4.1 Flash，
  // 按 Flash 价计费，因此预设价与 `deepseek-flash` 完全一致。
  'deepseek-v4-flash': {
    currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0,
    ...deepSeekPeak({ input: 1, output: 4, cacheRead: 0.02 }),
  },
  'deepseek-v4-flash-0731': {
    currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0,
    ...deepSeekPeak({ input: 1, output: 4, cacheRead: 0.02 }),
  },
  // V4 Flash Vision Exp 同样已下线并路由到 V4.1 Flash，按 Flash 价计费。
  'deepseek-v4-flash-vision-exp': {
    currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0,
    ...deepSeekPeak({ input: 1, output: 4, cacheRead: 0.02 }),
  },
  // V4 Pro：官方定价页脚注 (2)（2026-09-14 抓取）明确「在 2026 年 9 月 14 日之后
  // **继续提供** DeepSeek V4 Pro 的 API 调用服务，**计费方式保持不变**」。
  // 因此原先那条"9/14 之后改道到 Flash"的规则已被官方推翻，必须删掉：
  // 保留它会把 9/14 之后的 V4-Pro 调用错误地按 Flash 价计费（低报约 5 倍）。
  'deepseek-v4-pro': {
    currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0,
    ...deepSeekPeak({ input: 4.5, output: 13.5, cacheRead: 0.15 }),
  },
  'deepseek-v4-pro-0813': {
    currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0,
    ...deepSeekPeak({ input: 4.5, output: 13.5, cacheRead: 0.15 }),
  },
  // `deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 停止服务，官方定价页
  // 不再列出。保留最后一段计费口径（按 V4-Flash 价），仅供历史统计对账。
  'deepseek-chat': { currency: 'CNY', input: 1, output: 2, cacheRead: 0.2, cacheWrite: 0 },
  'deepseek-reasoner': { currency: 'CNY', input: 1, output: 2, cacheRead: 0.2, cacheWrite: 0 },
  // OpenAI（海外，USD / 百万 tokens）
  'gpt-5.6-luna': { currency: 'USD', input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  'gpt-5.6-terra': { currency: 'USD', input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
  'gpt-5.6-sol': { currency: 'USD', input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
  'gpt-5.5': { currency: 'USD', input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
  'gpt-5.4': { currency: 'USD', input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
  'gpt-5.4-mini': { currency: 'USD', input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
  'gpt-5.4-nano': { currency: 'USD', input: 0.2, output: 1.25, cacheRead: 0.02, cacheWrite: 0 },
  'gpt-5.3': { currency: 'USD', input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
  'gpt-5.2': { currency: 'USD', input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
  'gpt-5.1': { currency: 'USD', input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  'gpt-5': { currency: 'USD', input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  'gpt-5-mini': { currency: 'USD', input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
  'gpt-5-nano': { currency: 'USD', input: 0.05, output: 0.4, cacheRead: 0.005, cacheWrite: 0 },
  'gpt-4.1': { currency: 'USD', input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
  'gpt-4.1-mini': { currency: 'USD', input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0 },
  'gpt-4.1-nano': { currency: 'USD', input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
  'gpt-4o': { currency: 'USD', input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
  'gpt-4o-mini': { currency: 'USD', input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
  'o3': { currency: 'USD', input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
  'o3-mini': { currency: 'USD', input: 1.1, output: 4.4, cacheRead: 0.55, cacheWrite: 0 },
  'o4-mini': { currency: 'USD', input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 0 },
  // Anthropic（海外，USD）
  'claude-opus-4.8': { currency: 'USD', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4.7': { currency: 'USD', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4.5': { currency: 'USD', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4': { currency: 'USD', input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4.6': { currency: 'USD', input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4.5': { currency: 'USD', input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4': { currency: 'USD', input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4.5': { currency: 'USD', input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // Google Gemini（海外，USD）
  'gemini-3-pro-preview': { currency: 'USD', input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0.375 },
  'gemini-3-flash': { currency: 'USD', input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.0833 },
  'gemini-2.5-pro': { currency: 'USD', input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0.375 },
  'gemini-2.5-flash': { currency: 'USD', input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0.0833 },
  'gemini-2.5-flash-lite': { currency: 'USD', input: 0.1, output: 0.4, cacheRead: 0.01, cacheWrite: 0.0833 },
  // 通义千问 Qwen（国产，CNY）
  'qwen3-max': { currency: 'CNY', input: 5.58, output: 27.89, cacheRead: 1.12, cacheWrite: 6.97 },
  'qwen3-max-thinking': { currency: 'CNY', input: 5.58, output: 27.89, cacheRead: 1.12, cacheWrite: 6.97 },
  'qwen-plus': { currency: 'CNY', input: 1.86, output: 5.58, cacheRead: 0.37, cacheWrite: 2.32 },
  // 月之暗面 Kimi（国产，CNY）
  'kimi-k2': { currency: 'CNY', input: 4.08, output: 16.45, cacheRead: 0.68, cacheWrite: 0 },
  'kimi-k2-thinking': { currency: 'CNY', input: 4.29, output: 17.88, cacheRead: 1.07, cacheWrite: 0 },
  'kimi-k2.7': { currency: 'CNY', input: 5.08, output: 25.03, cacheRead: 1.07, cacheWrite: 0 },
  // 智谱 GLM（国产，CNY）
  'glm-4.6': { currency: 'CNY', input: 3.58, output: 14.3, cacheRead: 0.72, cacheWrite: 0 },
  'glm-4.5': { currency: 'CNY', input: 4.29, output: 15.73, cacheRead: 0.79, cacheWrite: 0 },
  'glm-4.5-air': { currency: 'CNY', input: 0.93, output: 6.08, cacheRead: 0.18, cacheWrite: 0 },
  // GLM-5.1：阿里云百炼官方价，输入 ¥6 / 输出 ¥24 / 缓存命中 ¥1.6 每百万 tokens。
  // 官方按输入长度分档（≤32k 与 32k–200k 为 ¥8/¥28），插件的价格模型是单一费率，
  // 这里取 ≤32k 档。
  'glm-5.1': { currency: 'CNY', input: 6, output: 24, cacheRead: 1.6, cacheWrite: 0 },
  // GLM-5.3-Flash：Z.ai 列表价 $0.15 / $0.50 / 缓存 $0.03 每百万 tokens（USD）。
  // 注意 $0.075/$0.25 是限时 5 折，不能当默认价用。
  'glm-5.3-flash': { currency: 'USD', input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
  // GLM-5.2 / GLM-5.3：Z.ai 官方**尚未公布 API 价格**（官方文档只列到 GLM-5.1 / GLM-5）。
  // 这里按上一代旗舰的公开行情 $1.40 / $4.40 预置，属于**参考值**——它比"0 元"
  // 诚实（0 会被读成免费），但请以官方公布为准。缓存价未公布，按 0 处理。
  'glm-5.2': { currency: 'USD', input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  'glm-5.3': { currency: 'USD', input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  // OpenAI GPT-6 Astra：$10 / $50 每百万 tokens（USD）。
  'gpt-6-astra': { currency: 'USD', input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
}

// 历史官方默认预设价，仅用于启动迁移：区分「用户停留在旧默认价」与「用户自定义价」。
// 每条对应一次官方调价（国产模型 CNY / 海外 USD，元/百万 tokens）。
const LEGACY_PRESET_PRICES = {
  // 0.3.0 及更早版本（V4 预览版定价，峰谷机制上线前）。
  v030: {
    'deepseek-v4-flash': { currency: 'CNY', input: 1.0, output: 2.0, cacheRead: 0.02, cacheWrite: 0 },
    'deepseek-v4-flash-0731': { currency: 'CNY', input: 1.0, output: 2.0, cacheRead: 0.02, cacheWrite: 0 },
    'deepseek-v4-pro': { currency: 'CNY', input: 3.11, output: 6.22, cacheRead: 0.026, cacheWrite: 0 },
    'deepseek-v4-pro-0813': { currency: 'CNY', input: 3.11, output: 6.22, cacheRead: 0.026, cacheWrite: 0 },
    'deepseek-chat': { currency: 'CNY', input: 1.79, output: 6.79, cacheRead: 0.93, cacheWrite: 0 },
    'deepseek-reasoner': { currency: 'CNY', input: 3.93, output: 15.66, cacheRead: 1.0, cacheWrite: 0 },
  },
  // 0.4.0–0.13.0 一度把 V4-Pro 直接预置成 Flash 价（误以为 9/14 的重路由已生效）。
  // 登记下来，让停留在该值的用户被迁移回 V4-Pro 的真实价格 + 时点规则。
  v041pro: {
    'deepseek-v4-pro': { currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0 },
    'deepseek-v4-pro-0813': { currency: 'CNY', input: 1, output: 4, cacheRead: 0.02, cacheWrite: 0 },
  },
  // 0.4.0–0.16.5 的 OpenAI / Z.AI 预置价（2026-09-14 按官方价目修正前）：
  // GPT-5.6 三档整体少了一半，Astra 与 GLM-5.2/5.3 漏了缓存命中价（读缓存被当成
  // 未命中计费 → 高估）。登记下来，让停留在这些值的用户被自动升级。
  v0165: {
    'gpt-5.6-luna': { currency: 'USD', input: 0.1, output: 0.6, cacheRead: 0.01, cacheWrite: 0.125 },
    'gpt-5.6-terra': { currency: 'USD', input: 1, output: 6, cacheRead: 0.1, cacheWrite: 1.25 },
    'gpt-5.6-sol': { currency: 'USD', input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
    'gpt-6-astra': { currency: 'USD', input: 10, output: 50, cacheRead: 0, cacheWrite: 0 },
    'glm-5.2': { currency: 'USD', input: 1.4, output: 4.4, cacheRead: 0, cacheWrite: 0 },
    'glm-5.3': { currency: 'USD', input: 1.4, output: 4.4, cacheRead: 0, cacheWrite: 0 },
  },
  // 0.3.2（2026-08-17 峰谷调价后，V4-Flash 空闲 ¥1.5/¥4.5/¥0.05；V4-Pro 与此后官方价一致）。
  v032: {
    'deepseek-v4-flash': { currency: 'CNY', input: 1.5, output: 4.5, cacheRead: 0.05, cacheWrite: 0 },
    'deepseek-v4-flash-0731': { currency: 'CNY', input: 1.5, output: 4.5, cacheRead: 0.05, cacheWrite: 0 },
    // 注意：不含 `deepseek-v4-pro` —— 08-17 那次的 V4-Pro 价（4.5/13.5/0.15）至今仍是
    // 官方价，与当前预设逐档相同。把它列为"历史默认价"会让迁移无法区分
    // "用户停在旧默认价"与"用户手填了同样的值"，而值相同时本来也无需迁移。
    'deepseek-chat': { currency: 'CNY', input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
    'deepseek-reasoner': { currency: 'CNY', input: 4, output: 16, cacheRead: 1, cacheWrite: 0 },
  },
}

// 支持「token plan」（预付 token 套餐 / 订阅制）的模型。
//
// 为什么需要这个标记：这类模型的用量由套餐覆盖，按量算出来的"费用"是**假的**——
// 勾选后插件只记 token、不再计费。名单按官方套餐的覆盖范围给出：
// 阿里云 Token Plan 的 Qwen 系、智谱/火山方舟 Coding Plan 的 GLM 系、
// OpenAI 的 Codex/ChatGPT 订阅、Anthropic 与 Google 的订阅、Moonshot 的 Kimi 套餐。
// **DeepSeek 没有套餐**（只有充值余额，按量扣减），因此不在此列——这也是这份名单
// 还能区分"该不该显示这个勾选框"的原因。需要增删直接改这里。
const TOKEN_PLAN_MODELS = [
  'qwen3-max', 'qwen3-max-thinking', 'qwen-plus',
  'glm-4.5', 'glm-4.5-air', 'glm-4.6', 'glm-5.1', 'glm-5.2', 'glm-5.3', 'glm-5.3-flash',
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.1', 'gpt-5.2', 'gpt-5.3', 'gpt-5.4', 'gpt-5.4-mini',
  'gpt-5.4-nano', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra',
  'claude-opus-4', 'claude-opus-4.5', 'claude-opus-4.7', 'claude-opus-4.8',
  'claude-sonnet-4', 'claude-sonnet-4.5', 'claude-sonnet-4.6', 'claude-haiku-4.5',
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-pro-preview', 'gemini-3-flash',
  'kimi-k2', 'kimi-k2-thinking', 'kimi-k2.7',
]
for (const tokenPlanId of TOKEN_PLAN_MODELS) {
  const entry = PRESET_PRICES[tokenPlanId]
  if (entry !== undefined) entry.tokenPlanSupported = true
}

// 模型 id 归一化：把 provider 前缀、日期后缀、`:batch` 变体和已退役的 DeepSeek 旧 id
// 折叠到价格表的规范键。DeepSeek 在 2026-09-10 把模型名改为 `deepseek-flash`，
// V4-Flash 系列随即下线；兼容 id 仍可调用但按 Flash 价计费，因此必须折叠到同一价格。
const MODEL_ALIASES = new Map([
  ['deepseek-v4-flash-vision-exp', 'deepseek-flash'],
  ['deepseek-flash-vision-exp', 'deepseek-flash'],
  // 第三方网关（Vercel AI Gateway / OpenRouter）自定的 slug；非官方 id，但同样
  // 指向 V4.1 Flash，命中同一价格。
  ['deepseek/deepseek-v4.1-flash', 'deepseek-flash'],
  ['deepseek/deepseek-v4.1-flash-beta', 'deepseek-flash'],
  ['deepseek-v4.1-flash', 'deepseek-flash'],
  // 注意：`deepseek-v4-pro` **不在**别名表里——在 9/14 改路由之前它仍是独立的
  // V4-Pro-0813，有独立的价格与统计。把它并进 Flash 会同时错算金额与合并统计。
  // 9/14 之后的费率变化由 preset 的 rerouteFrom / rerouteTo 表达，而不是改别名。
  ['deepseek-v4-flash', 'deepseek-flash'],
  // OpenRouter 上的匿名 stealth 模型 Ox Alpha，官方已确认它就是 GLM-5.3-Flash
  // （2026-08-20 起以匿名形式跑了 6 天，8/26 正式发布）。按同一价格计。
  ['ox-alpha', 'glm-5.3-flash'],
  ['deepseek-v4-flash-0731', 'deepseek-flash'],
])

/** 价格函数与快照共用的模型 id 归一化：先折叠别名，再剥离 provider 前缀与日期后缀。 */
export function normalizeModelId(model) {
  let key = String(model || '').trim()
  if (MODEL_ALIASES.has(key)) return MODEL_ALIASES.get(key)
  key = key.replace(/:batch$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/^[^/]+\//, '')
  return MODEL_ALIASES.get(key) || key
}

/**
 * 一组高峰窗口的签名：`rev>=3` 带时区与星期，`rev<3` 只有时段。
 * 用于把"停留在旧版默认窗口"的价格认出来并升级。
 * @param {object} price - 价格配置。
 * @returns {string} 窗口签名字符串。
 */
export function peakWindowSignature(price) {
  const describe = (window) => {
    if (!window || window.enabled !== true) return '-'
    const clock = (window.start || '') + '-' + (window.end || '')
    // 旧版数据没有 timezone/weekdays，窗口签名也就只含时段。
    if (window.timezone === undefined && window.weekdays === undefined) return clock
    return normalizeTimezone(window.timezone) + '/' + JSON.stringify(normalizeWeekdays(window.weekdays) || null) + '/' + clock
  }
  return describe(price && price.peak) + ';' + describe(price && price.peak2)
}

/** 解析 "HH:MM" 为当天分钟数；非法输入返回 null。 */export function parseClock(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * 判断某个时刻是否落在单个高峰窗口内。
 * 时段按窗口自己的时区（`window.timezone`，默认 UTC）解释，`weekdays` 限定生效的星期；
 * `start < end` 为 [start, end)，`start > end` 跨零点（如 22:00–06:00），
 * `start === end` 视为未配置高峰时段。
 * @param {object} window - 高峰窗口配置。
 * @param {Date} date - 待判断的时刻。
 * @returns {boolean} 该时刻是否按高峰价计费。
 */
export function inPeakWindow(window, date) {
  if (!window || window.enabled !== true) return false
  const start = parseClock(window.start)
  const end = parseClock(window.end)
  if (start === null || end === null || start === end) return false
  const clock = zonedClock(window.timezone, date)
  if (clock === null) return false
  const weekdays = normalizeWeekdays(window.weekdays)
  if (weekdays !== undefined && !weekdays.includes(clock.weekday)) return false
  if (start < end) return clock.minute >= start && clock.minute < end
  return clock.minute >= start || clock.minute < end
}

/**
 * 判断某个时刻是否落在价格配置的任一高峰窗口内（最多两个）。
 * 两个窗口共用同一组高峰价，因此高峰 token 合并统计即可精确计费；
 * 总开关为 `peak.enabled`，关闭时两个窗口都不生效。
 * @param {object} price - 价格配置。
 * @param {Date} date - 待判断的时刻。
 * @returns {boolean} 该时刻是否按高峰价计费。
 */
export function inPeak(price, date) {
  if (!price || !price.peak || price.peak.enabled !== true) return false
  return inPeakWindow(price.peak, date) || inPeakWindow(price.peak2, date)
}

/**
 * 价格查找：归一化模型 id 后再查价格表，使 provider 前缀、日期后缀、
 * `:batch` 变体与已退役的 DeepSeek 旧 id 都命中同一条价格。
 * @param {string} model - 原始模型 id。
 * @returns {object | undefined} 该模型的默认预设价。
 */
export function presetFor(model) {
  return PRESET_PRICES[normalizeModelId(model)]
}

export function apply(ctx) {
  const stats = new Map()
  const prices = new Map()
  const removed = new Set()
  // 时间台账：按天与小时聚合，供趋势图使用。只累加本功能上线后的增量。
  const dayBuckets = new Map()
  const hourBuckets = new Map()
  // 每个小时"已经并入当天"的快照，让归档幂等：写盘前与跨小时都会调用，
  // 重复调用只补差值，不会把同一小时累加两遍。
  const foldedHours = new Map()
  // 工具计数的"已并入当天"快照（与 models 分开，差值法同样保证幂等）。
  const foldedHourTools = new Map()
  // 热力图台账：日期 → { tokens, tools }。只累加本版本上线后的增量。
  const heatBuckets = new Map()
  // 历史回填是否已完成。完成前每次启动都会再跑一轮（带时间预算，可续跑）。
  let heatBackfilled = false
  // 回填累计恢复的天数。一轮读不完整个语料，按天幂等会分几轮补完（线上实测 4 轮补了 17 天）；
  // 面板要显示的是"恢复了多少历史"，而不是最后一轮的增量（那会显示成 1 天）。
  // **必须在 loadState() 之前声明**：它会被 loadState 赋值，`let` 的 TDZ 会让启动直接抛错。
  let backfillDaysTotal = 0
  // 回填完成的标记用**递增版本号**而不是布尔：旧版本曾在"语料为空"时误标完成，
  // 布尔标记会让那些数据永远不再回填。换成版本号后，旧布尔值自然失效、会重跑一轮。
  const HEAT_BACKFILL_REV = 2
  // 就绪的查询服务引用与"是否已被真实事件唤醒过"（见 session/event 里的唤醒逻辑）。
  let backfillQuery = null
  let backfillKicked = false
  // 会话 → 最近一次 LLM 调用的模型。工具事件本身不带模型，靠这里归因；
  // 条目数有界（只保留最近若干会话），避免长跑进程里无限增长。
  const lastModelBySession = new Map()
  const MAX_TRACKED_SESSIONS = 64
  // 当前处于哪个本地小时/日期；变化时把上一小时的明细并入当天台账（跨零点要把
  // 上一小时记到前一天），因此需要记住上一次的键与桶。
  let lastHourKey = null
  let lastHourBucket = null
  let lastDayKey = null
  // 数据文件版本（loadState 读取；null = 无文件/未加载）。旧版本数据在启动时
  // 执行一次默认价迁移，之后 version 升为 6，重启不再重复迁移。
  // v5：价格表改为 DeepSeek V4.1 官方口径，高峰窗口新增 timezone / weekdays。
  // v6：新增 dayBuckets / hourBuckets 时间台账。
  // v7：新增 heatBuckets 热力图台账（每天两个标量，保留 53 周）。
  let stateVersion = null
  let targetCurrency = 'CNY'
  let disposed = false

  const rates = { ...DEFAULT_RATES }
  let ratesSource = 'default'
  let ratesUpdatedAt = null
  let ratesFetchedAt = null
  let ratesLoading = false

  // API Key 余额查询状态与配置。balanceApiKey 仅保存在会话内存中，
  // 不落盘（避免明文密钥持久化）；持久化密钥请使用 DEEPSEEK_API_KEY
  // 凭证（credentials 服务 / 环境变量）。
  let balance = { status: 'none', total: null, currency: null, infos: [], updatedAt: null, message: null }
  let balanceApiKey = ''
  let balanceBaseUrl = ''

  const webServer = ctx.webServer

  const dshHome = process.env.DSH_HOME || (process.env.HOME || '') + '/.dsh'
  const dataFile = join(dshHome, 'musage-stats.json')

  const normalizePrice = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const normalizeCurrency = (value) => {
    const code = String(value || '').toUpperCase()
    return CURRENCIES.includes(code) ? code : undefined
  }
  const toCount = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }

  // 深拷贝默认预设：peak / peak2 是内嵌对象、weekdays 是内嵌数组，
  // 避免价格对象与常量共享引用后被就地改写。
  const copyPreset = (preset) => {
    if (!preset) return undefined
    return {
      ...preset,
      // 版本戳：标记这条价格来自哪个版本的默认预设，让启动迁移能识别
      // 「插件发的、但已过期」与「用户手填、不该覆盖」。
      presetRev: PRESET_REV,
      peak: copyWindow(preset.peak),
      peak2: copyWindow(preset.peak2),
    }
  }

  /** 深拷贝一个高峰窗口配置，并规范化 weekdays 数组。 */
  function copyWindow(window) {
    if (!window || typeof window !== 'object') return undefined
    const copy = { ...window }
    copy.weekdays = normalizeWeekdays(window.weekdays)
    return copy
  }

  // ---------- 持久化 ----------

  /**
   * 从数据文件恢复一张时间台账；非对象、非数字一律按 0 丢弃。
   * @param {unknown} source - 文件里的原始台账。
   * @param {Map<string, object>} target - 目标 Map（就地填充）。
   * @returns {void}
   */
  function loadBucketTable(source, target) {
    if (!source || typeof source !== 'object') return
    for (const [key, bucket] of Object.entries(source)) {
      if (!bucket || typeof bucket !== 'object' || !bucket.models || typeof bucket.models !== 'object') continue
      const restored = makeBucket()
      for (const [model, counts] of Object.entries(bucket.models)) {
        if (!counts || typeof counts !== 'object') continue
        const entry = {}
        for (const field of BUCKET_FIELDS) {
          const value = Number(counts[field])
          if (Number.isFinite(value) && value > 0) entry[field] = Math.floor(value)
        }
        if (Object.keys(entry).length > 0) restored.models[model] = entry
      }
      // 工具计数同样恢复：只接受正整数，非法一律丢弃。
      if (bucket.tools && typeof bucket.tools === 'object') {
        for (const [tool, counts] of Object.entries(bucket.tools)) {
          if (!counts || typeof counts !== 'object') continue
          const calls = Number(counts.calls)
          const failed = Number(counts.failed)
          if (!Number.isFinite(calls) || calls <= 0) continue
          restored.tools[String(tool)] = {
            calls: Math.floor(calls),
            failed: Number.isFinite(failed) && failed > 0 ? Math.floor(failed) : 0,
          }
        }
        pruneBucketTools(restored)
      }
      // 只有"模型明细与工具计数都为空"的桶才丢弃，否则会丢掉纯工具活动的小时。
      if (Object.keys(restored.models).length > 0 || Object.keys(restored.tools).length > 0) {
        target.set(String(key), restored)
      }
    }
    trimBuckets(target, target === dayBuckets ? MAX_DAYS : MAX_HOURS)
  }

  /** 按 MAX_HEAT_DAYS 裁剪热力图台账，只留最近的若干天。 */
  function trimHeatBuckets() {
    if (heatBuckets.size <= MAX_HEAT_DAYS) return
    const keys = Array.from(heatBuckets.keys()).sort()
    for (const key of keys.slice(0, keys.length - MAX_HEAT_DAYS)) heatBuckets.delete(key)
  }

  /**
   * 从数据文件恢复热力图台账；非法值一律按 0 丢弃。
   * @param {unknown} source - 文件里的原始账。
   * @returns {void}
   */
  function loadHeatBuckets(source) {
    if (!source || typeof source !== 'object') return
    for (const [key, value] of Object.entries(source)) {
      if (!value || typeof value !== 'object') continue
      const tokens = Number(value.tokens)
      const tools = Number(value.tools)
      const entry = {
        tokens: Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0,
        tools: Number.isFinite(tools) && tools > 0 ? Math.floor(tools) : 0,
      }
      if (entry.tokens > 0 || entry.tools > 0) heatBuckets.set(String(key), entry)
    }
    trimHeatBuckets()
  }

  function loadState() {
    try {
      if (!existsSync(dataFile)) return
      const raw = JSON.parse(readFileSync(dataFile, 'utf8'))
      if (!raw || typeof raw !== 'object') return
      if (typeof raw.version === 'number') stateVersion = raw.version
      if (raw.stats && typeof raw.stats === 'object') {
        for (const [key, value] of Object.entries(raw.stats)) {
          if (!value || typeof value !== 'object') continue
          stats.set(String(key), {
            calls: toCount(value.calls),
            failed: toCount(value.failed),
            inputTokens: toCount(value.inputTokens),
            cacheReadTokens: toCount(value.cacheReadTokens),
            cacheWriteTokens: toCount(value.cacheWriteTokens),
            outputTokens: toCount(value.outputTokens),
            reasoningTokens: toCount(value.reasoningTokens),
            peakInputTokens: toCount(value.peakInputTokens),
            peakCacheReadTokens: toCount(value.peakCacheReadTokens),
            peakCacheWriteTokens: toCount(value.peakCacheWriteTokens),
            peakOutputTokens: toCount(value.peakOutputTokens),
            toolCalls: toCount(value.toolCalls),
            toolFailed: toCount(value.toolFailed),
            providers: Array.isArray(value.providers) ? value.providers.filter((p) => typeof p === 'string') : [],
          })
        }
      }
      // 老数据没有「自定义计费」开关。判定规则：**与内置默认价不同**的条目是用户自己填的，
      // 必须保留并标记为自定义；相同的就是插件发的默认价，交给迁移继续升级。
      // 只写 true，false 一律留 undefined，避免数据文件被无意义地撑大。
      if (raw.prices && typeof raw.prices === 'object') {
        for (const [key, value] of Object.entries(raw.prices)) {
          if (!value || typeof value !== 'object') continue
          // 价格表以「数据文件里的原始模型 id」为键，别名折叠只在查找时发生
          // （normalizeModelId）。若在此处就折叠键，`deepseek-v4-pro` 会与
          // `deepseek-flash` 碰撞，而合并是后写覆盖先写，后者的残缺峰谷配置会
          // 压掉前者的正确预设，再被迁移规则误判为"用户关掉了峰谷"。
          prices.set(String(key), {
            currency: normalizeCurrency(value.currency) || 'USD',
            // 旧数据没有版本戳：迁移会退回按基础价与窗口签名的启发式判断。
            presetRev: Number.isInteger(value.presetRev) && value.presetRev > 0 ? value.presetRev : undefined,
            // 两个开关：`customPricing` 决定用用户填的价还是内置默认价，
            // `tokenPlan` 表示该模型走套餐（只记 token 不计费）。
            // 只存 true，缺省即 false，数据文件保持精简。
            customPricing: value.customPricing === true ? true : undefined,
            tokenPlan: value.tokenPlan === true ? true : undefined,
            // `rerouteFrom`/`rerouteTo` 是 0.4.0–0.16.5 用来表达"9/14 之后 V4-Pro 改按
            // Flash 价计费"的时点规则。官方定价页脚注 (2)（2026-09-14）已明确 V4-Pro
            // **继续提供且计费不变**，因此这条规则被推翻、字段不再透传：
            // 老数据里存过的值一律忽略，下次落盘即被清除（留着会继续按错价计费）。
            input: normalizePrice(value.input),
            output: normalizePrice(value.output),
            cacheRead: normalizePrice(value.cacheRead),
            cacheWrite: normalizePrice(value.cacheWrite),
            peak: value.peak && typeof value.peak === 'object'
              ? {
                  enabled: value.peak.enabled === true,
                  start: typeof value.peak.start === 'string' ? value.peak.start : '',
                  end: typeof value.peak.end === 'string' ? value.peak.end : '',
                  // **不要**把缺失的时区默认成 'UTC'：0.4.0 之前的窗口是按"服务器本地时间"
                  // 解释的，缺 timezone 正是那一代的特征。保留 undefined 才能让
                  // peakWindowSignature 认出旧窗口并把它迁移到官方 UTC 口径；
                  // 一旦这里填上 'UTC'，旧窗口就会被当成 UTC 解释（整体偏 8 小时），
                  // 而且签名不再匹配、迁移永远不会触发。求值时会按 UTC 处理。
                  timezone: value.peak.timezone === undefined ? undefined : normalizeTimezone(value.peak.timezone),
                  weekdays: normalizeWeekdays(value.peak.weekdays),
                  input: normalizePrice(value.peak.input),
                  output: normalizePrice(value.peak.output),
                  cacheRead: normalizePrice(value.peak.cacheRead),
                  cacheWrite: normalizePrice(value.peak.cacheWrite),
                }
              : undefined,
            peak2: value.peak2 && typeof value.peak2 === 'object'
              ? {
                  enabled: value.peak2.enabled === true,
                  start: typeof value.peak2.start === 'string' ? value.peak2.start : '',
                  end: typeof value.peak2.end === 'string' ? value.peak2.end : '',
                  timezone: value.peak2.timezone === undefined ? undefined : normalizeTimezone(value.peak2.timezone),
                  weekdays: normalizeWeekdays(value.peak2.weekdays),
                }
              : undefined,
          })
        }
      }
      if (Array.isArray(raw.removed)) for (const key of raw.removed) removed.add(normalizeModelId(key))
      // 时间台账：只接受已知计数字段，非法值一律按 0 丢弃，避免一个坏值污染整张图。
      loadBucketTable(raw.dayBuckets, dayBuckets)
      loadBucketTable(raw.hourBuckets, hourBuckets)
      loadHeatBuckets(raw.heatBuckets)
      if (raw.heatBackfillRev === HEAT_BACKFILL_REV) heatBackfilled = true
      // 回填恢复过的天数要跨重启保留：否则补齐之后再重启，回填被跳过、
      // 面板那句话就整句消失，用户看不到"历史是补来的"。
      if (Number.isFinite(raw.recoveredDays) && raw.recoveredDays > 0) backfillDaysTotal = Math.floor(raw.recoveredDays)
      // 恢复"当前小时"指针，让重启后紧接着的采样落进已有桶而不是另起一个。
      const nowKey = hourKeyOf(new Date())
      if (hourBuckets.has(nowKey)) {
        lastHourKey = nowKey
        lastHourBucket = hourBuckets.get(nowKey)
      }
      lastDayKey = dayKeyOf(new Date())
      if (CURRENCIES.includes(raw.targetCurrency)) targetCurrency = raw.targetCurrency
      if (raw.rates && typeof raw.rates === 'object') {
        let applied = false
        for (const code of CURRENCIES) {
          const value = Number(raw.rates[code])
          if (Number.isFinite(value) && value > 0) {
            rates[code] = value
            applied = true
          }
        }
        if (applied && raw.ratesSource === 'live') ratesSource = 'live'
        if (typeof raw.ratesUpdatedAt === 'string') ratesUpdatedAt = raw.ratesUpdatedAt
        if (typeof raw.ratesFetchedAt === 'string') ratesFetchedAt = raw.ratesFetchedAt
      }
      if (typeof raw.balanceBaseUrl === 'string') balanceBaseUrl = raw.balanceBaseUrl
      if (raw.balance && typeof raw.balance === 'object' && raw.balance.status) {
        const stored = raw.balance
        const total = Number(stored.total)
        balance = {
          status: ['ok', 'error', 'loading'].includes(stored.status) ? stored.status : 'none',
          total: Number.isFinite(total) ? total : null,
          currency: typeof stored.currency === 'string' ? stored.currency : null,
          infos: Array.isArray(stored.infos)
            ? stored.infos.filter((info) => info && typeof info === 'object').map((info) => ({
                currency: String(info.currency || 'CNY'),
                total: Number(info.total) || 0,
                granted: Number(info.granted) || 0,
                toppedUp: Number(info.toppedUp) || 0,
              }))
            : [],
          updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
          message: typeof stored.message === 'string' ? stored.message : null,
        }
      }
    } catch {
      // 文件损坏时从空状态开始，下次写入会覆盖。
    }
  }

  let dirty = false
  let writeTimer = null
  // 写盘防抖：默认 4 秒，压测/单测可用 DSH_MODEL_USAGE_FLUSH_MS 调小，
  // 否则每个用例都得等满防抖窗口，既慢又在负载下卡边界。
  const flushDelayMs = (() => {
    const raw = Number(process.env.DSH_MODEL_USAGE_FLUSH_MS)
    return Number.isFinite(raw) && raw > 0 ? raw : 4000
  })()

  function stopWriteTimer() {
    if (writeTimer === null) return
    writeTimer()
    writeTimer = null
  }

  function flushSync() {
    stopWriteTimer()
    try {
      // 落盘前把"当前小时"的进行中明细并入当天台账，避免进程被杀时丢掉最后一小时。
      foldCurrentHourIntoDay()
      trimHeatBuckets()
      const state = {
        version: 7,
        targetCurrency,
        stats: Object.fromEntries(stats),
        prices: Object.fromEntries(prices),
        removed: Array.from(removed),
        dayBuckets: Object.fromEntries(dayBuckets),
        hourBuckets: Object.fromEntries(hourBuckets),
        heatBuckets: Object.fromEntries(heatBuckets),
        heatBackfillRev: heatBackfilled ? HEAT_BACKFILL_REV : 0,
        recoveredDays: backfillDaysTotal,
        balanceBaseUrl,
        balance,
        rates,
        ratesSource,
        ratesUpdatedAt,
        ratesFetchedAt,
      }
      mkdirSync(dshHome, { recursive: true })
      const tmp = dataFile + '.' + process.pid + '.tmp'
      writeFileSync(tmp, JSON.stringify(state, null, 2))
      renameSync(tmp, dataFile)
      dirty = false
    } catch {
      // 写盘失败：保留 dirty 并重新武装定时器，稍后重试。
      dirty = true
      if (writeTimer === null) {
        writeTimer = ctx.interval(() => {
          if (dirty) flushSync()
          else stopWriteTimer()
        }, flushDelayMs)
      }
    }
  }

  function schedulePersist() {
    // dispose 之后不再武装写盘定时器（in-flight 的 llm/stream 可能在
    // dispose 之后才结束，避免产生永不被清理的周期 flush）。
    if (disposed) return
    dirty = true
    if (writeTimer !== null) return
    writeTimer = ctx.interval(() => {
      if (dirty) flushSync()
      else stopWriteTimer()
    }, flushDelayMs)
  }

  // 比较价格的基础五要素（计价货币 + 四档单价），忽略峰谷配置。
  const sameBasePrice = (a, b) => {
    if (!a || !b || a.currency !== b.currency) return false
    return Math.abs((a.input || 0) - (b.input || 0)) < 1e-9
      && Math.abs((a.output || 0) - (b.output || 0)) < 1e-9
      && Math.abs((a.cacheRead || 0) - (b.cacheRead || 0)) < 1e-9
      && Math.abs((a.cacheWrite || 0) - (b.cacheWrite || 0)) < 1e-9
  }
  // 高峰窗口是否已配置有效时段（非空且 start !== end）。
  const hasValidPeakWindow = (window) => !!window && window.enabled === true
    && parseClock(window.start) !== null && parseClock(window.end) !== null
    && parseClock(window.start) !== parseClock(window.end)

  // 启动迁移：把已知模型的默认预设升级到当前版本（仅对旧版本数据执行一次）。
  //
  // 关键是要区分「插件发的默认时段」与「用户手填的时段」——只看"有没有配有效
  // 时段"会把插件自己发的旧预设误判成用户自定义，导致永远升不上去。因此：
  // 带 presetRev 的价格说明它来自某个版本的默认预设，可直接升级；旧数据没有
  // 该字段，则退回「基础价等于历史默认价」加「窗口签名等于历代默认窗口」判断。
  //
  // 规则：
  // ① 峰谷开关明确关闭（enabled === false）→ 尊重用户选择，保持关闭；
  // ② 版本戳已是最新 → 无需处理；
  // ③ 基础价是任一历史官方默认价，或窗口签名匹配某个历代默认预设 → 整体升级；
  // ④ 基础价仍是当前官方价、窗口有效但时区/星期缺失（0.3.x 数据）→ 只补
  //    时区与星期，保留用户可能改过的时段；
  // ⑤ 其余视为用户自定义：峰谷窗口残缺（开关开着、时段为空/无效）时只关闭
  //    残缺窗口，绝不覆盖自定义单价。
  function migrateLegacyDefaults() {
    let changed = 0
    for (const [model, price] of prices) {
      // 价格表以原始 id 为键，先归一化再查预设；命中后仍写回原始键，
      // 避免两个别名（如 deepseek-v4-pro 与 deepseek-flash）在写入时碰撞。
      const key = normalizeModelId(model)
      const preset = PRESET_PRICES[key]
      if (!preset) continue
      // 用户明确选了「自定义计费」的条目一律不碰：那些数字是他的，不是插件的默认值。
      // （开关关掉时数值仍然保留，所以这里只看开关，不看数值是否等于当前预设。）
      if (price.customPricing === true) continue
      if (price.presetRev === PRESET_REV) continue
      if ((price.peak && price.peak.enabled === false) || (price.peak2 && price.peak2.enabled === false)) continue
      // 开关开着但没有有效时段（手加模型留下的空窗口）：这种价格从未被计过高峰，
      // 不能算用户自定义的时段，应连同基础价一起按当前口径重来。注意只针对
      // "声明了峰谷但时段为空"，没有峰谷配置的纯单价价格不在此列。
      const hasValidPeak = hasValidPeakWindow(price.peak) || hasValidPeakWindow(price.peak2)
      const peakDeclared = price.peak?.enabled === true || price.peak2?.enabled === true
      if ((peakDeclared && !hasValidPeak) || historicalDefaultFor(model, price) || windowMatchesShippedPreset(price)) {
        prices.set(model, copyPreset(preset))
        changed++
        continue
      }
      // 基础价已是当前官方价、窗口也有效（不残缺），只是缺时区/星期：
      // 这是 0.3.x 发的预设，补上口径即可，不动时段本身。
      const bothWindowsWanted = !!price.peak?.enabled && !!price.peak2?.enabled
      if (sameBasePrice(price, preset) && hasValidPeak && bothWindowsWanted) {
        prices.set(model, {
          ...copyPreset(preset),
          input: price.input, output: price.output, cacheRead: price.cacheRead, cacheWrite: price.cacheWrite,
          peak: { ...copyWindow(preset.peak), start: price.peak?.start ?? preset.peak?.start, end: price.peak?.end ?? preset.peak?.end },
          peak2: preset.peak2 ? { ...copyWindow(preset.peak2), start: price.peak2?.start ?? preset.peak2?.start, end: price.peak2?.end ?? preset.peak2?.end } : undefined,
        })
        changed++
        continue
      }
      // 走到这里说明窗口残缺：可能只是缺少未启用时段（用户只想要一个窗口），
      // 这种情况保留基础价并把空窗口关掉，不要整体覆盖成默认预设。
      if (!hasValidPeak && ((price.peak && price.peak.enabled === true) || (price.peak2 && price.peak2.enabled === true))) {
        const next = { ...price, peak: price.peak ? { ...price.peak, enabled: false } : undefined, peak2: price.peak2 ? { ...price.peak2, enabled: false } : undefined }
        prices.set(model, next)
        changed++
      }
    }
    return changed
  }

  /** 价格的高峰窗口签名是否等于某个历代默认预设（即"这是插件发的时段"）。 */
  function windowMatchesShippedPreset(price) {
    const signature = peakWindowSignature(price)
    for (const [known, rev] of PEAK_WINDOW_SIGNATURES) {
      if (signature === known && rev !== PRESET_REV) return true
    }
    return false
  }

  /**
   * 给"有统计但没有价格"的模型补上默认预设价。
   * 跳过用户显式移除过的模型（尊重 `removed`）。
   * @returns {number} 补齐的条目数。
   */
  function backfillMissingPrices() {
    let filled = 0
    for (const model of stats.keys()) {
      if (removed.has(model)) continue
      const preset = presetFor(model)
      if (!preset) continue
      const existing = prices.get(model)
      if (existing !== undefined) {
        // 已有条目但四档单价全为 0：这是"未配置"被写成了 0（历史上 set-price 的行为），
        // 界面上会显示成免费。带版本戳的条目属于默认预设，不在此列。
        const allZero = existing.presetRev === undefined
          && !existing.input && !existing.output && !existing.cacheRead && !existing.cacheWrite
        if (!allZero) continue
      }
      prices.set(model, copyPreset(preset))
      filled++
    }
    return filled
  }

  /** 该模型的历史官方默认价里，是否有与当前基础价逐档相同的一条。 */
  function historicalDefaultFor(model, price) {
    const key = normalizeModelId(model)
    for (const generation of Object.values(LEGACY_PRESET_PRICES)) {
      // 历史台账同样可能只有别名那条（如 deepseek-v4-flash），两种键都试。
      const entry = generation[key] || generation[model]
      if (entry && sameBasePrice(price, entry)) return entry
    }
    return undefined
  }

  loadState()
  // 迁移旧默认价为最新官方默认预设（DeepSeek V4.1 定价 + UTC 工作日高峰窗口）。
  // 仅在旧版本（version < 5）数据上执行一次；新安装（无数据文件）不处理。
  // v6 只新增时间台账字段，不需要价格迁移；v5 及更早才跑一次默认价迁移。
  // 迁移条件：状态版本过旧（引入版本戳之前的数据），或数据的版本戳落后于当前
  // PRESET_REV（官方调价 / 修正口径）。两者都不能只看状态版本——否则像
  // "V4-Pro 价格被修正"这类变化永远推不下去。
  const needsMigration = stateVersion === null
    || stateVersion < PRESET_STATE_VERSION
    || Array.from(prices.values()).some((price) => price.presetRev !== PRESET_REV)
  const migrated = needsMigration && migrateLegacyDefaults() > 0
  // 不变量：**有统计的模型必须有价**。
  // `record()` 里的自动套用只在首次调用时触发；若某模型首次调用时价格表还没有它
  // （例如 `deepseek-flash` 在旧版本里不存在），之后永远不会补上，界面上就出现
  // "有调用量但没有价格"。这里在启动时兜底补齐。
  if (backfillMissingPrices() > 0 || migrated) schedulePersist()
  // **必须在迁移之后**判定"用户自定义计费"：迁移负责把"停在历代默认价"的条目升级到
  // 当前口径；如果先判定，历史默认价会因为"与当前预设不同"而被误判成用户自己填的，
  // 迁移从此碰不到它（旧口径会永久留在账上）。
  detectCustomPricing()

  // ---------- 历史回填 ----------
  //
  // 时间台账只从本版本上线后开始累积，而之前的用量仍完整存在于会话日志里。
  // 启动时通过 ctx.sessionQuery（base 组合已挂载，openAt: never 时精确读仍可用）
  // 读一次历史，把**台账里还没有的日子**补上。
  //
  // 三条规则，缺一不可：
  // ① 只填缺失的日子 —— 已存在的（含今天）一律不动，因此不会与实时采集重复计数。
  // ② 只统计本会话自有事件（切掉 inheritedEventCount）—— fork 会话会继承父会话事件。
  // ③ 有时间预算，超时就**不写标记**，下次启动继续 —— 大批量会话可以分几次跑完。

  let backfill = { state: 'pending', days: 0, sessions: 0, scanned: 0, total: 0 }
  let backfillRunning = false
  let backfillStartedAt = 0
  let backfillAttempts = 0
  let backfillSource = 'none'
  // 说明：'pending' = 等待服务就绪；'unavailable' = 该部署没有该服务；
  // 'done' / 'partial' = 回填完成 / 受时间预算截断（下次启动续跑）；'error' = 异常。

  /**
   * 给一次可能永不落定的调用加上限。
   *
   * 注入得到的服务实例可能挂在内部依赖上永不 settle（线上实测：同一个进程里，
   * 注入实例的 `listSessions()` 一直没有结果，而调用时 `ctx.get('sessionQuery')`
   * 当场返回 589 条）。没有超时的话这次调用会永远挂着，把整个回填功能锁死。
   * @param {Promise<unknown>} promise - 待限时的调用。
   * @param {number} ms - 上限毫秒数。
   * @param {string} label - 超时信息里的调用名。
   * @returns {Promise<unknown>} 原结果，或超时错误。
   */
  const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
    let settled = false
    // `ctx.timeout` 与 `ctx.interval` 一样返回 **disposer**，不是 timer id。
    const disposeTimer = ctx.timeout(() => {
      if (settled) return
      settled = true
      reject(new Error(label + ' 超时（' + ms + 'ms）'))
    }, ms)
    promise.then((value) => {
      if (settled) return
      settled = true
      disposeTimer()
      resolve(value)
    }, (error) => {
      if (settled) return
      settled = true
      disposeTimer()
      reject(error)
    })
  })
  // 测试用 `DSH_MODEL_USAGE_BACKFILL_TIMEOUT_MS` 把等待压到毫秒级（同写盘防抖的做法）。
  const parsedTimeout = Number(process.env.DSH_MODEL_USAGE_BACKFILL_TIMEOUT_MS)
  const LIST_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15_000
  // 一次运行可以被视为"卡住"的时长：超过它，新的尝试允许插进来（防自锁的第二道保险）。
  const STALE_RUN_MS = LIST_TIMEOUT_MS * 6

  /**
   * 回填历史日账；只填台账里缺失的日子。
   * @returns {Promise<{state: string, days: number, sessions: number, scanned: number}>} 结果。
   */
  async function runBackfill(query) {
    // `backfillRunning` 是去抖，不是锁：卡住的运行必须能被后来的尝试顶掉，
    // 否则一次挂死就等于这个功能永久失效（重启才恢复，而且每次启动都会重演）。
    if (backfillRunning && Date.now() - backfillStartedAt < STALE_RUN_MS) return backfill
    backfillRunning = true
    backfillStartedAt = Date.now()
    backfillAttempts += 1
    try {
      return await scanBackfill(query)
    } finally {
      // 无论正常返回、抛错还是超时，都必须复位。
      backfillRunning = false
    }
  }

  /**
   * 该会话的起始日（连次日一起）是否都已经在台账里，因此无需再读它的日志。
   *
   * 次日也算进去，是为了不把跨零点、把用量写到次日的会话整段跳过。
   * 今天一律视为已覆盖——实时台账在管今天，回填从不碰它。
   * @param {number|undefined} createdAt - 会话头部的创建时间（epoch ms）。
   * @returns {boolean} 是否可以跳过读取。
   */
  function isSessionDayCovered(createdAt) {
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return false
    const todayKey = dayKeyOf(new Date())
    const covered = (time) => {
      const key = dayKeyOf(new Date(time))
      if (key === todayKey) return true
      return heatBuckets.has(key) && dayBuckets.has(key)
    }
    const next = new Date(createdAt)
    next.setDate(next.getDate() + 1)
    return covered(createdAt) && covered(next.getTime())
  }

  /**
   * 回填的实际扫描（由 {@link runBackfill} 负责加锁与复位）。
   * @returns {Promise<{state: string, days: number, sessions: number, scanned: number}>} 结果。
   */
  async function scanBackfill(query) {
    const parsedBudget = Number(process.env.DSH_MODEL_USAGE_BACKFILL_BUDGET_MS)
    const budgetMs = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 30_000
    const startedAt = Date.now()
    const sessions = await withTimeout(query.listSessions(), LIST_TIMEOUT_MS, 'listSessions')
    // 新的在前：先补最近的日子，用户最容易先看到。
    sessions.sort((a, b) => (b.header.createdAt || 0) - (a.header.createdAt || 0))
    const todayKey = dayKeyOf(new Date())
    const total = sessions.length
    let scanned = 0
    let filled = 0
    let skipped = 0
    let complete = true
    for (const record of sessions) {
      if (Date.now() - startedAt > budgetMs) { complete = false; break }
      // 用**会话头部时间戳**跳过已经补过的日子：读一份日志要解压 + 回放，约 0.27s，
      // 而 589 个会话里绝大多数属于已知日子。不跳过的话，每轮 30 秒预算都被
      // 最新那批已知日子吃光，缺失的老日子永远轮不到——线上表现就是
      // "total 589、scanned 113、days 0、partial"，一轮轮空转。
      // 按天幂等：这一轮补上的日子，下一轮会被这里瞬间跳过，于是逐轮向更早推进。
      if (isSessionDayCovered(record.header && record.header.createdAt)) { skipped += 1; continue }
      let snapshot
      try {
        snapshot = await query.readSession(record.header.id)
      } catch {
        // 单个会话读失败（损坏 / 已被清理）不应中断整轮回填。
        continue
      }
      scanned += 1
      const owned = Array.isArray(snapshot.events) ? snapshot.events.slice(snapshot.inheritedEventCount || 0) : []
      if (owned.length === 0) continue
      const days = aggregateSessionEvents(owned, (time) => dayKeyOf(new Date(time)))
      for (const [dayKey, totals] of days) {
        if (dayKey === todayKey) continue          // 今天归实时采集
        if (heatBuckets.has(dayKey)) continue      // 已有账（实时采过）→ 不碰，避免重复计算
        heatBuckets.set(dayKey, { tokens: totals.tokens, tools: totals.tools })
        filled += 1
        // 在这一刻累计而不是在函数返回时累计：中途抛错时，已经写进台账的日子
        // 仍然是"恢复过的历史"，不能在计数里丢掉。
        backfillDaysTotal += 1
        // 明细日账只补快照窗口内的日子：它带着逐模型信息，属于"看得见"的范围。
        if (!dayBuckets.has(dayKey) && dayBuckets.size < MAX_DAYS) {
          const bucket = makeBucket()
          for (const [model, counts] of totals.models) addToBucket(bucket, model, counts)
          recomputeBucketTotal(bucket)
          dayBuckets.set(dayKey, bucket)
        }
      }
    }
    trimHeatBuckets()
    trimBuckets(dayBuckets, MAX_DAYS)
    // 语料为空说明服务还没把持久化历史挂上来（启动早期就是这样），**不能**标记完成，
    // 否则永远不会再试——线上首版正是这样"跑了一次、什么都没补、然后放弃"。
    const state = total === 0 ? 'empty' : (complete ? 'done' : 'partial')
    if (state === 'done') heatBackfilled = true
    backfillRunning = false
    schedulePersist()
    return { state, days: filled, sessions: scanned, scanned, skipped, total }
  }

  /**
   * 给没有「自定义计费」开关的老条目补上判定：与内置默认价不同 → 用户自定义。
   * 放在 loadState() 之后、任何迁移之前，避免把用户手填的价当成"停在旧默认价"覆盖掉。
   */
  function detectCustomPricing() {
    for (const [model, price] of prices) {
      if (price.customPricing !== undefined) continue
      const preset = PRESET_PRICES[normalizeModelId(model)]
      if (preset === undefined) {
        // 内置价目里没有的模型（用户自己加的）当然算自定义。
        price.customPricing = true
        continue
      }
      // 与当前预设一致，或明显是某个历代出厂默认价 → 不是用户数据，交给迁移继续升级。
      const shipped = sameBasePrice(price, preset) || historicalDefaultFor(model, price) || windowMatchesShippedPreset(price)
      price.customPricing = shipped ? undefined : true
    }
  }

  /**
   * 解析当前可用的 `sessionQuery`。
   *
   * 注入时捕获的实例可能已经不工作（线上实测同一进程里它一直没有结果，
   * 而调用时 `ctx.get('sessionQuery')` 当场返回 589 条），所以每个调用点都重新解析，
   * 只把注入实例当作兜底。
   * @param {object} fallback - 注入回调里拿到的实例。
   * @returns {object} 本次调用要用的实例。
   */
  function resolveSessionQuery(fallback) {
    const current = typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined
    backfillSource = current === undefined ? 'injected' : 'ctx.get'
    return current === undefined ? fallback : current
  }

  // 用**延迟注入**等服务就绪，而不是在 apply 里直接 ctx.get：
  // apply 执行时该插件可能还没注册（组合里有这一行 ≠ 此刻已可读），
  // 直接查会拿到 undefined —— 这正是线上"回填没跑"的原因。
  // ctx.inject 的回调在依赖可用后触发；服务始终不存在时回调不触发，插件不受影响。
  const markBackfillUnavailable = () => {
    if (backfill.state === 'pending') backfill = { state: 'unavailable', days: 0, sessions: 0, scanned: 0, total: 0 }
  }
  if (heatBackfilled) {
    backfill = { state: 'skipped', days: 0, sessions: 0, scanned: 0, total: 0 }
  } else {
    // 一轮往往不够：① 服务刚就绪时语料可能还是空的；② 会话多时会被时间预算截断。
    // 两者都靠"稍后重试"收敛，且重试是安全的——只填缺失的日子。
    const MAX_ATTEMPTS = 15
    const RETRY_DELAY_MS = 20_000
    let attempts = 0
    const attempt = (query) => {
      // 插件生命周期结束后不再安排重试。
      if (disposed) return
      backfillQuery = query
      // 注入回调只用来判断"服务何时可用"；真正调用时重新解析（见 resolveSessionQuery）。
      runBackfill(resolveSessionQuery(query)).then((result) => {
        backfill = result
        attempts += 1
        if (result.state === 'done' || attempts >= MAX_ATTEMPTS || disposed) return
        // 注意 `ctx.interval` 返回的是 **disposer 函数**而不是 timer id：
        // 必须调用它来停掉定时器，用 clearInterval 是无效的（会变成无限重试）。
        const disposeTimer = ctx.interval(() => {
          disposeTimer()
          attempt(query)
        }, RETRY_DELAY_MS)
      }).catch((error) => {
        // 瞬时失败（超时 / 服务刚就绪）同样要留在重试链里：
        // 之前这里只记状态、不排下一次，等于一次抖动就永久放弃。
        backfill = { state: 'error', days: 0, sessions: 0, scanned: 0, total: 0, message: (error && error.message) || String(error) }
        attempts += 1
        if (attempts >= MAX_ATTEMPTS || disposed) return
        const retryAfterError = ctx.interval(() => { retryAfterError(); attempt(backfillQuery) }, RETRY_DELAY_MS)
      })
    }
    ctx.inject(['sessionQuery'], (scoped) => { attempt(scoped.sessionQuery) })
    // 兜底：一段时间后服务仍未出现，标记为不可用，便于从界面区分"还在等"与"没有"。
    ctx.interval(markBackfillUnavailable, 20_000)
  }

  /**
   * 被真实会话事件唤醒的一次补跑。
   * 启动瞬间 `listSessions()` 可能返回 0（会话索引尚未就绪），而定时重试最多只覆盖几分钟。
   * 一旦有任何会话事件到达，就说明语料确实存在了 —— 此刻补跑一轮，比单纯加长定时器更可靠。
   * 只唤醒一次，且不新增重试链（重试仍由 attempt 那条链负责），避免并发多轮扫描。
   */
  function kickBackfill() {
    if (backfillKicked || disposed || heatBackfilled || backfillQuery === null) return
    if (backfill.state !== 'empty' && backfill.state !== 'pending') return
    backfillKicked = true
    runBackfill(resolveSessionQuery(backfillQuery)).then((result) => { backfill = result }).catch(() => {})
  }

  // 启动时若没有任何缓存汇率，自动刷新一次并写盘（失败静默，等待客户端按需重试）。
  if (ratesFetchedAt === null) refreshRates().catch(() => {})

  // ---------- 统计采集 ----------

  function ensure(model) {
    const key = String(model || 'unknown')
    let entry = stats.get(key)
    if (!entry) {
      entry = { calls: 0, failed: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, toolCalls: 0, toolFailed: 0, providers: [] }
      stats.set(key, entry)
    }
    return entry
  }

  function record(model, provider, usage) {
    const key = String(model || 'unknown')
    const entry = ensure(key)
    entry.calls += 1
    entry.inputTokens += usage.inputTokens || 0
    entry.cacheReadTokens += usage.cacheReadTokens || 0
    entry.cacheWriteTokens += usage.cacheWriteTokens || 0
    entry.outputTokens += usage.outputTokens || 0
    entry.reasoningTokens += usage.reasoningTokens || 0
    if (provider && !entry.providers.includes(provider)) entry.providers.push(provider)
    // 首次观测到该模型且用户未自定义/移除价格时，自动套用默认预设（含计价货币）。
    if (entry.calls === 1 && !prices.has(key) && !removed.has(key)) {
      const preset = presetFor(key)
      if (preset) prices.set(key, copyPreset(preset))
    }
    // 峰谷定价：按调用结束时刻判断是否落在任一高峰时段，高峰 token 单独计数，
    // 非高峰 = 总量 - 高峰量。高峰价格配置由用户为模型启用后生效（最多两个高峰时段）。
    const now = new Date()
    const delta = {
      calls: 1,
      failed: 0,
      inputTokens: usage.inputTokens || 0,
      cacheReadTokens: usage.cacheReadTokens || 0,
      cacheWriteTokens: usage.cacheWriteTokens || 0,
      outputTokens: usage.outputTokens || 0,
      reasoningTokens: usage.reasoningTokens || 0,
      peakInputTokens: 0,
      peakCacheReadTokens: 0,
      peakCacheWriteTokens: 0,
      peakOutputTokens: 0,
    }
    if (inPeak(prices.get(key), now)) {
      entry.peakInputTokens += delta.inputTokens
      entry.peakCacheReadTokens += delta.cacheReadTokens
      entry.peakCacheWriteTokens += delta.cacheWriteTokens
      entry.peakOutputTokens += delta.outputTokens
      delta.peakInputTokens = delta.inputTokens
      delta.peakCacheReadTokens = delta.cacheReadTokens
      delta.peakCacheWriteTokens = delta.cacheWriteTokens
      delta.peakOutputTokens = delta.outputTokens
    }
    recordBucketSample(key, delta, now)
    schedulePersist()
  }

  // ---------- 工具调用采集 ----------

  // 工具事件不带模型，按"该会话最近一次 LLM 调用的模型"归因；会话未知时归到 unknown，
  // 仍然计入总量与工具排行，只是不参与按模型拆分。
  ctx.on('session/event', (session, event) => {
    if (!event || typeof event.type !== 'string') return
    // 有真实事件 = 语料已就绪：唤醒一次历史回填（见 kickBackfill）。
    kickBackfill()
    if (event.type !== 'tool/call' && event.type !== 'tool/result') return
    const data = event.data || {}
    const tool = typeof data.name === 'string' && data.name !== '' ? data.name : 'unknown'
    const sessionKey = session && session.id !== undefined && session.id !== null ? String(session.id) : null
    const model = sessionKey !== null ? (lastModelBySession.get(sessionKey) || 'unknown') : 'unknown'
    const failed = event.type === 'tool/result' && data.error !== undefined && data.error !== null
    const now = new Date()
    // 计入按模型的台账（toolCalls / toolFailed 走同一组 BUCKET_FIELDS）。
    // 注意工具名只在 tool/call 时累加：一次调用会产生 call 与 result 两个事件，
    // 两边都加会把调用数算成两倍。
    const isCall = event.type === 'tool/call'
    // 同时维护按模型的全量计数：首页的占比卡与效率卡要和三个关键数字同口径
    // （全部），而不是各自按时间窗口算一遍。
    const statsEntry = ensure(model)
    if (isCall) statsEntry.toolCalls += 1
    if (failed) statsEntry.toolFailed += 1
    recordBucketSample(model, {
      calls: 0, failed: 0,
      toolCalls: isCall ? 1 : 0,
      toolFailed: failed ? 1 : 0,
    }, now, isCall || failed ? tool : undefined)
    schedulePersist()
  }, { global: true })

  // ---------- 时间台账 ----------

  /**
   * 把当前小时的进行中明细并入它所属的那一天（幂等地覆盖式重算，可安全重复调用）。
   * 归档时机是"跨小时"与"写盘前"，因此跨零点也会记到前一天。
   * @returns {void}
   */
  function foldCurrentHourIntoDay() {
    if (lastHourKey === null || lastHourBucket === null) return
    if (Object.keys(lastHourBucket.models).length === 0) return
    const targetDay = lastHourKey.slice(0, 10)
    let day = dayBuckets.get(targetDay)
    if (!day) { day = makeBucket(); dayBuckets.set(targetDay, day) }
    // 用"当天已归档部分 + 当前小时"重建，避免同一小时被反复累加。
    // 做法：先减掉该小时上一次并入的量，再加当前量——用一份快照记录已并入值。
    const folded = foldedHours.get(lastHourKey) || {}
    for (const [name, counts] of Object.entries(lastHourBucket.models)) {
      // `$total` 是桶自带的合计，合并时按明细重算，不能当普通模型再加一遍。
      if (name === '$total') continue
      const previous = folded[name] || {}
      for (const field of BUCKET_FIELDS) {
        const now = counts[field] || 0
        const before = previous[field] || 0
        if (now !== before) {
          const target = day.models[name] || (day.models[name] = {})
          target[field] = Math.max(0, (target[field] || 0) + (now - before))
        }
      }
    }
    // 工具计数同样并入当天：与模型计数共用同一套差值快照。
    const dayTools = day.tools || (day.tools = {})
    const foldedToolSnapshot = foldedHourTools.get(lastHourKey) || {}
    for (const [name, counts] of Object.entries(lastHourBucket.tools || {})) {
      const previous = foldedToolSnapshot[name] || {}
      const target = dayTools[name] || (dayTools[name] = {})
      for (const field of ['calls', 'failed']) {
        const now = counts[field] || 0
        const before = previous[field] || 0
        if (now !== before) target[field] = Math.max(0, (target[field] || 0) + (now - before))
      }
    }
    foldedHourTools.set(lastHourKey, JSON.parse(JSON.stringify(lastHourBucket.tools || {})))
    foldedHours.set(lastHourKey, JSON.parse(JSON.stringify(lastHourBucket.models)))
    trimBuckets(dayBuckets, MAX_DAYS)
    pruneBucket(day)
    // 维护桶不变量：`$total` 始终等于各模型之和。快照侧会跳过它自行重算，
    // 但落盘数据要自洽，外部对账脚本读文件时才能直接用。
    recomputeBucketTotal(day)
  }

  /**
   * 重算桶内 `$total`，使其等于各模型计数之和。
   * @param {object} bucket - 目标桶（就地修改）。
   * @returns {void}
   */
  function pruneBucketTools(bucket) {
    const names = Object.keys(bucket.tools || {})
    if (names.length <= MAX_TOOL_NAMES) return
    names.sort((a, b) => (bucket.tools[b].calls || 0) - (bucket.tools[a].calls || 0))
    for (const drop of names.slice(MAX_TOOL_NAMES)) delete bucket.tools[drop]
  }

  function recomputeBucketTotal(bucket) {
    const total = {}
    for (const [name, counts] of Object.entries(bucket.models)) {
      if (name === '$total') continue
      for (const field of BUCKET_FIELDS) {
        const value = counts[field]
        if (value) total[field] = (total[field] || 0) + value
      }
    }
    bucket.models.$total = total
  }

  /**
   * 把一次采样的增量写进小时与当天台账；跨小时时把上一小时并入「它所属的那一天」，
   * 因此跨零点也不会把前一天的数据记到新的一天。
   * @param {string} model - 模型 id。
   * @param {object} delta - 计数字段增量。
   * @param {Date} now - 采样时刻。
   * @returns {void}
   */
  function recordBucketSample(model, delta, now, tool) {
    const hourKey = hourKeyOf(now)
    if (hourKey !== lastHourKey) {
      // 归档上一小时后，新小时的"已并入"快照归零。
      foldCurrentHourIntoDay()
      let hour = hourBuckets.get(hourKey)
      if (!hour) { hour = makeBucket(); hourBuckets.set(hourKey, hour) }
      lastHourKey = hourKey
      lastHourBucket = hour
      trimBuckets(hourBuckets, MAX_HOURS)
    }
    addToBucket(lastHourBucket, model, delta)
    if (tool !== undefined) addToolToBucket(lastHourBucket, tool, delta.toolFailed > 0, delta.toolCalls > 0)
    const dayKey = dayKeyOf(now)
    // 热力图：每天两个标量。与明细台账分开，才能长期保留而不撑大 payload。
    const heat = heatBuckets.get(dayKey) || { tokens: 0, tools: 0 }
    heat.tokens += (delta.inputTokens || 0) + (delta.cacheReadTokens || 0)
      + (delta.cacheWriteTokens || 0) + (delta.outputTokens || 0)
    heat.tools += delta.toolCalls || 0
    heatBuckets.set(dayKey, heat)
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey
      if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, makeBucket())
      trimBuckets(dayBuckets, MAX_DAYS)
    }
  }


  // 拦截每次流式模型调用：透传所有 chunk，只采集 usage。
  ctx.on('llm/stream', (options, next) => {
    const provider = options.provider
    const model = options.model
    // 记下该会话最近用的模型，供后面的工具事件归因。
    if (options.sessionId !== undefined && options.sessionId !== null) {
      const sessionKey = String(options.sessionId)
      lastModelBySession.delete(sessionKey)
      lastModelBySession.set(sessionKey, String(model || 'unknown'))
      while (lastModelBySession.size > MAX_TRACKED_SESSIONS) {
        const oldest = lastModelBySession.keys().next().value
        lastModelBySession.delete(oldest)
      }
    }
    const upstream = next()
    return (async function* wrapped() {
      let usage = null
      try {
        for await (const chunk of upstream) {
          if (chunk.type === 'usage') usage = chunk.usage
          yield chunk
        }
      } finally {
        if (usage) {
          record(model, provider, usage)
        } else {
          // 结束但没有 usage：error / aborted / 提前中断的调用，计为失败，
          // 保证每次被拦截的调用都进入统计（不"蒸发"）。
          ensure(model).failed += 1
          schedulePersist()
        }
      }
    })()
  })

  // ---------- 汇率 ----------

  async function refreshRates() {
    if (ratesLoading) return false
    ratesLoading = true
    try {
      const sources = [
        'https://open.er-api.com/v6/latest/USD',
        'https://api.frankfurter.app/latest?from=USD&to=' + CURRENCIES.join(','),
      ]
      for (const url of sources) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
          if (!response.ok) continue
          const data = await response.json()
          const table = data && data.rates ? data.rates : null
          if (!table) continue
          let applied = false
          for (const code of CURRENCIES) {
            const value = Number(table[code])
            if (Number.isFinite(value) && value > 0) {
              rates[code] = value
              applied = true
            }
          }
          if (applied) {
            ratesSource = 'live'
            ratesUpdatedAt = data.time_last_update_utc || new Date().toISOString()
            ratesFetchedAt = new Date().toISOString()
            schedulePersist()
            return true
          }
        } catch {
          // 尝试下一个数据源。
        }
      }
    } finally {
      ratesLoading = false
    }
    // 刷新失败时保留上一次成功缓存（若有），不退回默认值；
    // 从未成功获取过才回退默认值，等待客户端按需重试。
    if (ratesFetchedAt === null) {
      ratesSource = 'default'
      ratesUpdatedAt = null
    }
    return false
  }

  // 汇率缓存策略：
  // - 成功获取的汇率连同时间戳写入数据文件（rates / ratesSource /
  //   ratesUpdatedAt / ratesFetchedAt），进程重启后直接复用缓存；
  // - 启动时若没有任何缓存汇率（从未成功获取过），自动刷新一次；
  // - 用户每次打开设置页查看统计时由客户端判断：缓存不超过一周则不自动刷新，
  //   必须手动点击"更新汇率"；无缓存或缓存超过一周则自动刷新一次。

  // ---------- API Key 余额查询 ----------

  async function refreshBalance() {
    balance = { ...balance, status: 'loading', updatedAt: new Date().toISOString() }
    try {
      let apiKey = (balanceApiKey || '').trim()
      if (!apiKey) {
        const credentials = ctx.get('credentials')
        if (credentials !== undefined) {
          try {
            const resolved = await credentials.resolve('DEEPSEEK_API_KEY')
            if (resolved && resolved.value) apiKey = resolved.value
          } catch {
            // 凭证解析失败则继续尝试环境变量。
          }
        }
      }
      if (!apiKey && process.env.DEEPSEEK_API_KEY) apiKey = process.env.DEEPSEEK_API_KEY
      if (!apiKey) {
        balance = { status: 'error', total: null, currency: null, infos: [], updatedAt: new Date().toISOString(), message: '未配置 API Key（可在此页填写，或配置 DEEPSEEK_API_KEY）' }
        return false
      }
      const base = (balanceBaseUrl || '').trim() || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
      const response = await fetch(base.replace(/\/+$/, '') + '/user/balance', {
        headers: { Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(10000),
      })
      const data = await response.json()
      if (!response.ok || !data || !Array.isArray(data.balance_infos)) {
        const detail = data && data.error ? ' ' + JSON.stringify(data.error) : ''
        balance = { status: 'error', total: null, currency: null, infos: [], updatedAt: new Date().toISOString(), message: '余额查询失败：HTTP ' + response.status + detail }
        return false
      }
      const infos = data.balance_infos.map((info) => ({
        currency: info.currency || 'CNY',
        total: Number(info.total_balance || 0),
        granted: Number(info.granted_balance || 0),
        toppedUp: Number(info.topped_up_balance || 0),
      }))
      const primary = infos[0]
      balance = {
        status: 'ok',
        total: primary ? primary.total : 0,
        currency: primary ? primary.currency : 'CNY',
        infos,
        updatedAt: new Date().toISOString(),
        message: null,
      }
      if (!disposed) schedulePersist()
      return true
    } catch (err) {
      balance = { status: 'error', total: null, currency: null, infos: [], updatedAt: new Date().toISOString(), message: (err && err.message) || String(err) }
      return false
    }
  }

  // 启动时静默查询一次余额（失败不影响其他功能）。
  refreshBalance()

  // ---------- 快照与操作 ----------

  // ---------- 快照辅助 ----------

  /**
   * 合并"当天已归档"与"当前小时进行中"的模型计数，并扣掉已经计入当天的那部分。
   * `folded` 是该小时上一次并入当天的快照；差值法保证幂等，重复调用不会重复累加。
   * @param {Record<string, object>} dayModels - 当天桶的模型计数。
   * @param {Record<string, object>} hourModels - 当前小时的模型计数。
   * @param {Record<string, object>} folded - 当前小时已并入当天的快照。
   * @returns {Record<string, object>} 合并结果（新对象，不改动入参）。
   */
  function mergeModels(dayModels, hourModels, folded, dayTools, hourTools, foldedTools) {
    const merged = {}
    for (const [name, counts] of Object.entries(dayModels)) merged[name] = { ...counts }
    for (const [name, counts] of Object.entries(hourModels)) {
      // `$total` 由 bucketPoint 从明细重算，这里跳过以免重复计入。
      if (name === '$total') continue
      const target = merged[name] || (merged[name] = {})
      const already = folded[name] || {}
      for (const field of SERIES_FIELDS) {
        const delta = (counts[field] || 0) - (already[field] || 0)
        if (delta !== 0) target[field] = Math.max(0, (target[field] || 0) + delta)
      }
    }
    // 工具计数与模型计数分开合并；工具快照同样走差值，重复调用不会累加两遍。
    const tools = {}
    for (const [name, counts] of Object.entries(dayTools || {})) tools[name] = { ...counts }
    for (const [name, counts] of Object.entries(hourTools || {})) {
      const target = tools[name] || (tools[name] = {})
      const already = (foldedTools || {})[name] || {}
      for (const field of ['calls', 'failed']) {
        const delta = (counts[field] || 0) - (already[field] || 0)
        if (delta !== 0) target[field] = Math.max(0, (target[field] || 0) + delta)
      }
    }
    return { models: merged, tools }
  }

  /** 台账里参与聚合的字段（$total 与每个模型都按同一组字段读写）。 */
  const SERIES_FIELDS = ['calls', 'failed', 'inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'peakInputTokens', 'peakCacheReadTokens', 'peakCacheWriteTokens', 'peakOutputTokens', 'toolCalls', 'toolFailed']

  /** 一串归零的台账字段，供没有数据的桶复用。 */
  function emptySeriesFields() {
    return { calls: 0, failed: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, toolCalls: 0, toolFailed: 0 }
  }

  /**
   * 把一张台账桶摊平成快照里的一个点。每个模型只带 k 与费用相关的必要明细，
   * 避免 120 天 × 24 模型的全字段导致 payload 膨胀。
   * @param {string} key - 日期或小时键。
   * @param {Record<string, object>} models - 桶内的模型计数。
   * @returns {object} 快照点。
   */
  function bucketPoint(key, models, withDetail, tools) {
    const byModel = {}
    let fields = null
    for (const [name, counts] of Object.entries(models)) {
      // `$total` 是桶内的合计缓存，不是模型；合计由下面按明细重算。
      if (name === '$total') continue
      if (withDetail === false) {
        if (fields === null) fields = emptySeriesFields()
        for (const field of SERIES_FIELDS) fields[field] += counts[field] || 0
        continue
      }
      const slim = {
        k: name,
        c: counts.calls || 0,
        i: counts.inputTokens || 0,
        r: counts.cacheReadTokens || 0,
        w: counts.cacheWriteTokens || 0,
        o: counts.outputTokens || 0,
        n: counts.reasoningTokens || 0,
        pi: counts.peakInputTokens || 0,
        pr: counts.peakCacheReadTokens || 0,
        pw: counts.peakCacheWriteTokens || 0,
        po: counts.peakOutputTokens || 0,
        tc: counts.toolCalls || 0,
        tf: counts.toolFailed || 0,
      }
      byModel[name] = slim
      if (fields === null) fields = emptySeriesFields()
      for (const field of SERIES_FIELDS) fields[field] += counts[field] || 0
    }
    if (fields === null) fields = emptySeriesFields()
    return {
      date: key,
      calls: fields.calls,
      failed: fields.failed,
      inputTokens: fields.inputTokens,
      cacheReadTokens: fields.cacheReadTokens,
      cacheWriteTokens: fields.cacheWriteTokens,
      outputTokens: fields.outputTokens,
      reasoningTokens: fields.reasoningTokens,
      peakInputTokens: fields.peakInputTokens,
      peakCacheReadTokens: fields.peakCacheReadTokens,
      peakCacheWriteTokens: fields.peakCacheWriteTokens,
      peakOutputTokens: fields.peakOutputTokens,
      toolCalls: fields.toolCalls,
      toolFailed: fields.toolFailed,
      byModel,
      // 按工具名的计数（只保留最高频的若干个）；没有工具活动时省略以省 payload。
      tools: tools && Object.keys(tools).length ? tools : undefined,
    }
  }

  function snapshot() {
    const rows = []
    for (const [model, entry] of stats) {
      rows.push({
        model,
        // 归一化后的价格键：让 Client 无需自带别名表就能查到该模型的价格。
        modelKey: normalizeModelId(model),
        calls: entry.calls,
        failed: entry.failed,
        inputTokens: entry.inputTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens,
        peakInputTokens: entry.peakInputTokens,
        peakCacheReadTokens: entry.peakCacheReadTokens,
        peakCacheWriteTokens: entry.peakCacheWriteTokens,
        peakOutputTokens: entry.peakOutputTokens,
        toolCalls: entry.toolCalls,
        toolFailed: entry.toolFailed,
        providers: entry.providers.slice(),
      })
    }
    rows.sort((a, b) => (b.calls + b.failed) - (a.calls + a.failed) || a.model.localeCompare(b.model))
    const priceMap = {}
    for (const [model, price] of prices) priceMap[model] = { ...price }
    // presets 随快照下发，让 Client 与 Host 共用同一份默认价（含高峰窗口配置），
    // 避免价格表在两端各存一份后发生漂移。
    const presetMap = {}
    for (const [model, preset] of Object.entries(PRESET_PRICES)) presetMap[model] = copyPreset(preset)
    // 时间序列：归档部分来自 dayBuckets；当天桶已由 foldCurrentHourIntoDay 并入
    // 当前小时，因此这里只补"当前小时里尚未归档的增量"，不会重复累加。
    const daySeries = []
    const todayKey = dayKeyOf(new Date())
    const sortedDays = Array.from(dayBuckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-SERIES_SNAPSHOT_DAYS)
    const detailFrom = Math.max(0, sortedDays.length - SERIES_DETAIL_DAYS)
    for (let dayIndex = 0; dayIndex < sortedDays.length; dayIndex += 1) {
      const [date, bucket] = sortedDays[dayIndex]
      const withDetail = dayIndex >= detailFrom
      if (date !== todayKey) {
        daySeries.push(bucketPoint(date, bucket.models, withDetail, bucket.tools))
        continue
      }
      const folded = foldedHours.get(lastHourKey) || {}
      const mergedDay = mergeModels(
        bucket.models,
        lastHourBucket ? lastHourBucket.models : {},
        folded,
        bucket.tools,
        lastHourBucket ? lastHourBucket.tools : {},
        foldedHourTools.get(lastHourKey) || {},
      )
      daySeries.push(bucketPoint(date, mergedDay.models, true, mergedDay.tools))
    }
    if (!dayBuckets.has(todayKey) && lastHourBucket !== null) {
      const mergedToday = mergeModels({}, lastHourBucket.models, {}, {}, lastHourBucket.tools, {})
      daySeries.push(bucketPoint(todayKey, mergedToday.models, true, mergedToday.tools))
      daySeries.sort((a, b) => a.date.localeCompare(b.date))
    }
    const hourSeries = []
    for (const [hour, bucket] of Array.from(hourBuckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      hourSeries.push(bucketPoint(hour, bucket.models, true, bucket.tools))
    }
    // 热力图：只发有活动的日子，缺省即 0。两个短字段名把 371 天的体积压到 ~10KB。
    const heatSeries = Array.from(heatBuckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ d: date, t: value.tokens, k: value.tools }))
    return {
      rows,
      prices: priceMap,
      presets: presetMap,
      daySeries,
      hourSeries,
      heatSeries,
      rates: { ...rates },
      ratesSource,
      ratesUpdatedAt,
      ratesFetchedAt,
      targetCurrency,
      pluginVersion: PLUGIN_VERSION,
      // `days` 是最后一次运行的增量（手动 action 也复用它）；
      // `daysTotal` 是本进程内累计恢复的天数，面板那句话用它。
      backfill: { ...backfill, daysTotal: backfillDaysTotal },
      // 诊断用：卡住的运行会让 state 停在旧值，光看 state 分不清"没数据"和"被锁死"。
      backfillDebug: {
        running: backfillRunning,
        attempts: backfillAttempts,
        startedAt: backfillStartedAt || null,
        source: backfillSource,
      },
      heatBackfilled,
      balance: { ...balance, infos: balance.infos.slice() },
    }
  }

  async function handleAction(body) {
    const action = body && body.action
    switch (action) {
      case 'set-price': {
        const model = String((body && body.model) || '')
        if (!model) return { ok: false, error: 'missing model' }
        const existing = prices.get(model)
        const flagPatch = {}
        if (typeof body?.customPricing === 'boolean') flagPatch.customPricing = body.customPricing
        if (typeof body?.tokenPlan === 'boolean') flagPatch.tokenPlan = body.tokenPlan

        // 只翻开关时**绝不重写数值**：这是"勾选/取消勾选不丢用户自定义计费"的落点。
        // 客户端在开关切换时只发 `{model, customPricing|tokenPlan}`，不带上表单里那些
        // （关掉自定义计时显示的是内置默认价）数字，否则会把用户填过的价覆盖成默认价。
        if (body?.price === undefined && Object.keys(flagPatch).length > 0) {
          const preset = presetFor(model)
          const base = existing ?? (preset ? copyPreset(preset) : undefined)
          if (base === undefined) return { ok: false, error: 'no price to attach the flag to' }
          const next = { ...base }
          if (flagPatch.customPricing !== undefined) next.customPricing = flagPatch.customPricing ? true : undefined
          if (flagPatch.tokenPlan !== undefined) next.tokenPlan = flagPatch.tokenPlan ? true : undefined
          prices.set(model, next)
          removed.delete(model)
          schedulePersist()
          return { ok: true }
        }

        const src = (body && body.price) || {}
        const peakSrc = (src.peak && typeof src.peak === 'object') ? src.peak : {}
        const peak2Src = (src.peak2 && typeof src.peak2 === 'object') ? src.peak2 : {}
        const hasValues = Number(src.input) > 0 || Number(src.output) > 0 || Number(src.cacheRead) > 0 || Number(src.cacheWrite) > 0
          || peakSrc.enabled === true
          || Number(peakSrc.input) > 0 || Number(peakSrc.output) > 0 || Number(peakSrc.cacheRead) > 0 || Number(peakSrc.cacheWrite) > 0
          || peak2Src.enabled === true
        // 未填任何价格（含峰谷配置）时：有默认预设就套用预设；没有预设就**什么都不写**。
        //
        // 曾经在这种情况下写入一条全 0 的价格，于是界面上显示成"¥0"（读起来像免费），
        // 而正确答案是"未配置价格"。空的加号输入框会走到这里。
        if (!hasValues) {
          const preset = presetFor(model)
          if (preset) {
            prices.set(model, copyPreset(preset))
            removed.delete(model)
            schedulePersist()
            return { ok: true }
          }
          if (!existing) return { ok: true, skipped: 'no price configured' }
        }
        prices.set(model, {
          // 开关跟随请求，缺省沿用已有值（旧 Client 不带这两个字段时不丢状态）。
          customPricing: flagPatch.customPricing !== undefined ? (flagPatch.customPricing ? true : undefined) : existing?.customPricing,
          tokenPlan: flagPatch.tokenPlan !== undefined ? (flagPatch.tokenPlan ? true : undefined) : existing?.tokenPlan,
          currency: normalizeCurrency(src.currency) || (existing && existing.currency) || 'USD',
          input: normalizePrice(src.input),
          output: normalizePrice(src.output),
          cacheRead: normalizePrice(src.cacheRead),
          cacheWrite: normalizePrice(src.cacheWrite),
          peak: {
            enabled: peakSrc.enabled === true,
            start: typeof peakSrc.start === 'string' ? peakSrc.start : '',
            end: typeof peakSrc.end === 'string' ? peakSrc.end : '',
            // 未提交时区/星期时沿用已有配置：兼容仍按本地时间提交的旧 Client。
            timezone: normalizeTimezone(peakSrc.timezone !== undefined ? peakSrc.timezone : existing?.peak?.timezone),
            weekdays: peakSrc.weekdays !== undefined ? normalizeWeekdays(peakSrc.weekdays) : normalizeWeekdays(existing?.peak?.weekdays),
            input: normalizePrice(peakSrc.input),
            output: normalizePrice(peakSrc.output),
            cacheRead: normalizePrice(peakSrc.cacheRead),
            cacheWrite: normalizePrice(peakSrc.cacheWrite),
          },
          peak2: {
            enabled: peak2Src.enabled === true,
            start: typeof peak2Src.start === 'string' ? peak2Src.start : '',
            end: typeof peak2Src.end === 'string' ? peak2Src.end : '',
            timezone: normalizeTimezone(peak2Src.timezone !== undefined ? peak2Src.timezone : existing?.peak2?.timezone),
            weekdays: peak2Src.weekdays !== undefined ? normalizeWeekdays(peak2Src.weekdays) : normalizeWeekdays(existing?.peak2?.weekdays),
          },
        })
        removed.delete(model)
        schedulePersist()
        return { ok: true }
      }
      case 'remove-price': {
        const model = String((body && body.model) || '')
        prices.delete(model)
        if (model) removed.add(model)
        schedulePersist()
        return { ok: true }
      }
      case 'reset-stats': {
        stats.clear()
        schedulePersist()
        return { ok: true }
      }
      case 'load-default-prices': {
        prices.clear()
        removed.clear()
        for (const [model, preset] of Object.entries(PRESET_PRICES)) prices.set(model, copyPreset(preset))
        schedulePersist()
        return { ok: true }
      }
      case 'set-target-currency': {
        const code = normalizeCurrency(body && body.currency)
        if (!code) return { ok: false, error: 'unsupported currency' }
        targetCurrency = code
        schedulePersist()
        return { ok: true }
      }
      case 'refresh-rates': {
        await refreshRates()
        return { rates: { ...rates }, ratesSource, ratesUpdatedAt, ratesFetchedAt }
      }
      case 'refresh-balance': {
        await refreshBalance()
        return { ...balance, infos: balance.infos.slice() }
      }
      case 'set-balance-config': {
        // apiKey 仅保存在会话内存，不落盘（避免明文密钥持久化）。
        if (body && typeof body.apiKey === 'string') balanceApiKey = body.apiKey
        if (body && typeof body.baseUrl === 'string') balanceBaseUrl = body.baseUrl
        schedulePersist()
        return { ok: true }
      }
      case 'backfill': {
        // 免重启的手动重跑：服务缺失时给出明确原因，而不是静默无事发生。
        const query = ctx.get('sessionQuery')
        if (query === undefined) {
          return { ok: false, error: 'sessionQuery 服务不可用（该部署未挂载）', state: backfill.state }
        }
        backfill = await runBackfill(resolveSessionQuery(query))
        return { ok: true, ...backfill }
      }
      case 'diag': {
        const report = { node: process.version, hasWebServer: webServer !== undefined, fetchType: typeof fetch, ratesSource }
        try {
          const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) })
          report.fetchStatus = response.status
          const data = await response.json()
          report.cny = data && data.rates ? data.rates.CNY : undefined
        } catch (err) {
          report.fetchError = (err && err.message) || String(err)
        }
        return report
      }
      default:
        return { ok: false, error: 'unknown action: ' + String(action) }
    }
  }

  // ---------- webServer 路由 ----------

  function sendJson(res, data, status) {
    const text = JSON.stringify(data)
    res.statusCode = status || 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(text))
    res.end(text)
  }

  const disposers = []
  if (webServer !== undefined) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/__musage-stats',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) {
          sendJson(res, { ok: false, error: 'loopback access required' }, 403)
          return
        }
        if (req.method === 'GET') {
          sendJson(res, snapshot())
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, { ok: false, error: 'method not allowed' }, 405)
          return
        }
        // 必须 return 这个 promise：否则 handler 立刻返回、响应在被测代码之外才写出，
        // 错误也传不到服务器（真实 HTTP 下看不出差别，但测试无法确定性地等待结果）。
        return parseJsonRequest(req).then((body) => {
          return handleAction(body).then((result) => sendJson(res, result))
        }).catch(() => {
          sendJson(res, { ok: false, error: 'bad request' }, 400)
        })
      },
    }))
  }

  ctx.on('dispose', () => {
    disposed = true
    stopWriteTimer()
    flushSync()
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // 忽略卸载期异常。
      }
    }
  })
}

// 纯函数与价格表的测试出口。apply 之外的调用方（单测、对账脚本）用它
// 复用同一份计费口径，避免在测试里复制价格常量。
export const internals = {
  PRESET_PRICES,
  PRESET_REV,
  PEAK_WINDOW_SIGNATURES,
  LEGACY_PRESET_PRICES,
  MODEL_ALIASES,
  PEAK_UTC,
  normalizeModelId,
  normalizeWeekdays,
  normalizeTimezone,
  peakWindowSignature,
  presetFor,
  zonedClock,
  parseClock,
  inPeakWindow,
  inPeak,
}
