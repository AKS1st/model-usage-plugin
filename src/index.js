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
import { join } from 'node:path'

export const name = 'model-usage-plugin'
// webServer 由 web 组合保证提供；声明为硬依赖使 apply 等待其就绪后再运行，
// 避免启动时序抖动导致路由未注册。
export const inject = ['webServer']

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD', 'CAD']
// 各货币相对 USD 的通常汇率（在线查询失败时的默认值，1 USD = X）。
const DEFAULT_RATES = { USD: 1, CNY: 7.15, EUR: 0.92, GBP: 0.79, JPY: 149, HKD: 7.8, AUD: 1.5, CAD: 1.37 }

// 主流模型默认预设价（元/百万 tokens）。国产模型（DeepSeek/通义/Kimi/智谱）
// 按国内价格以 CNY 计价，海外模型（OpenAI/Anthropic/Gemini）按美元计价。
// 国产模型 CNY 数值 = 美元参考价 × 7.15（通常汇率）折算。
const PRESET_PRICES = {
  // DeepSeek（国产，CNY 元 / 百万 tokens）
  // 2026-08-17 起官方改为峰谷计费：高峰时段（每日 09:00–12:00、14:00–18:00，
  // 服务器本地时间，对应官方 UTC 01:00–04:00、06:00–10:00）价格为空闲时段 2 倍。
  // V4 系列默认预设预置两个官方高峰时段与高峰价；chat/reasoner 为官方最新价。
  'deepseek-v4-flash': {
    currency: 'CNY', input: 1.5, output: 4.5, cacheRead: 0.05, cacheWrite: 0,
    peak: { enabled: true, start: '09:00', end: '12:00', input: 3, output: 9, cacheRead: 0.1, cacheWrite: 0 },
    peak2: { enabled: true, start: '14:00', end: '18:00' },
  },
  'deepseek-v4-flash-0731': {
    currency: 'CNY', input: 1.5, output: 4.5, cacheRead: 0.05, cacheWrite: 0,
    peak: { enabled: true, start: '09:00', end: '12:00', input: 3, output: 9, cacheRead: 0.1, cacheWrite: 0 },
    peak2: { enabled: true, start: '14:00', end: '18:00' },
  },
  'deepseek-v4-pro': {
    currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0,
    peak: { enabled: true, start: '09:00', end: '12:00', input: 9, output: 27, cacheRead: 0.3, cacheWrite: 0 },
    peak2: { enabled: true, start: '14:00', end: '18:00' },
  },
  'deepseek-v4-pro-0813': {
    currency: 'CNY', input: 4.5, output: 13.5, cacheRead: 0.15, cacheWrite: 0,
    peak: { enabled: true, start: '09:00', end: '12:00', input: 9, output: 27, cacheRead: 0.3, cacheWrite: 0 },
    peak2: { enabled: true, start: '14:00', end: '18:00' },
  },
  'deepseek-chat': { currency: 'CNY', input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
  'deepseek-reasoner': { currency: 'CNY', input: 4, output: 16, cacheRead: 1, cacheWrite: 0 },
  // OpenAI（海外，USD / 百万 tokens）
  'gpt-5.6-luna': { currency: 'USD', input: 0.1, output: 0.6, cacheRead: 0.01, cacheWrite: 0.125 },
  'gpt-5.6-terra': { currency: 'USD', input: 1, output: 6, cacheRead: 0.1, cacheWrite: 1.25 },
  'gpt-5.6-sol': { currency: 'USD', input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
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
}

// 0.3.0 及更早版本的旧 DeepSeek 默认预设价（无峰谷配置）。
// 仅用于启动迁移：仍停留在旧默认价、或峰谷开关开着但时段为空的已知模型，
// 自动升级到最新的官方默认预设（两个高峰时段 + 官方定价）。
const LEGACY_PRESET_PRICES = {
  'deepseek-v4-flash': { currency: 'CNY', input: 1.0, output: 2.0, cacheRead: 0.02, cacheWrite: 0 },
  'deepseek-v4-flash-0731': { currency: 'CNY', input: 1.0, output: 2.0, cacheRead: 0.02, cacheWrite: 0 },
  'deepseek-v4-pro': { currency: 'CNY', input: 3.11, output: 6.22, cacheRead: 0.026, cacheWrite: 0 },
  'deepseek-v4-pro-0813': { currency: 'CNY', input: 3.11, output: 6.22, cacheRead: 0.026, cacheWrite: 0 },
  'deepseek-chat': { currency: 'CNY', input: 1.79, output: 6.79, cacheRead: 0.93, cacheWrite: 0 },
  'deepseek-reasoner': { currency: 'CNY', input: 3.93, output: 15.66, cacheRead: 1.0, cacheWrite: 0 },
}

export function apply(ctx) {
  const stats = new Map()
  const prices = new Map()
  const removed = new Set()
  // 数据文件版本（loadState 读取；null = 无文件/未加载）。旧版本数据在启动时
  // 执行一次默认价迁移，之后 version 升为 4，重启不再重复迁移。
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

  // 深拷贝默认预设：peak / peak2 是内嵌对象，避免价格对象与常量共享引用。
  const copyPreset = (preset) => {
    if (!preset) return undefined
    return {
      ...preset,
      peak: preset.peak ? { ...preset.peak } : undefined,
      peak2: preset.peak2 ? { ...preset.peak2 } : undefined,
    }
  }

  // ---------- 持久化 ----------

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
            providers: Array.isArray(value.providers) ? value.providers.filter((p) => typeof p === 'string') : [],
          })
        }
      }
      if (raw.prices && typeof raw.prices === 'object') {
        for (const [key, value] of Object.entries(raw.prices)) {
          if (!value || typeof value !== 'object') continue
          prices.set(String(key), {
            currency: normalizeCurrency(value.currency) || 'USD',
            input: normalizePrice(value.input),
            output: normalizePrice(value.output),
            cacheRead: normalizePrice(value.cacheRead),
            cacheWrite: normalizePrice(value.cacheWrite),
            peak: value.peak && typeof value.peak === 'object'
              ? {
                  enabled: value.peak.enabled === true,
                  start: typeof value.peak.start === 'string' ? value.peak.start : '',
                  end: typeof value.peak.end === 'string' ? value.peak.end : '',
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
                }
              : undefined,
          })
        }
      }
      if (Array.isArray(raw.removed)) for (const key of raw.removed) removed.add(String(key))
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

  function flushSync() {
    if (writeTimer !== null) {
      clearInterval(writeTimer)
      writeTimer = null
    }
    try {
      const state = {
        version: 4,
        targetCurrency,
        stats: Object.fromEntries(stats),
        prices: Object.fromEntries(prices),
        removed: Array.from(removed),
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
        writeTimer = setInterval(() => {
          if (dirty) flushSync()
          else if (writeTimer !== null) {
            clearInterval(writeTimer)
            writeTimer = null
          }
        }, 4000)
        if (writeTimer.unref) writeTimer.unref()
      }
    }
  }

  function schedulePersist() {
    // dispose 之后不再武装写盘定时器（in-flight 的 llm/stream 可能在
    // dispose 之后才结束，避免产生永不被清理的周期 flush）。
    if (disposed) return
    dirty = true
    if (writeTimer !== null) return
    writeTimer = setInterval(() => {
      if (dirty) flushSync()
      else if (writeTimer !== null) {
        clearInterval(writeTimer)
        writeTimer = null
      }
    }, 4000)
    if (writeTimer.unref) writeTimer.unref()
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

  // 启动迁移：已知 DeepSeek 模型自动套用最新官方默认预设（仅对旧版本数据执行一次）。
  // 规则：
  // ① 已配置有效高峰时段 → 用户自定义，保持不动；
  // ② 峰谷开关明确关闭（enabled === false）→ 保持关闭，不重新打开；
  // ③ 基础价仍是旧默认价或当前官方基础价 → 整体升级为最新官方预设（含两个高峰时段）；
  // ④ 基础价是用户自定义但峰谷窗口残缺（开关开着、时段为空/无效）→ 保留基础价，
  //    仅关闭残缺窗口，不覆盖自定义单价。
  function migrateLegacyDefaults() {
    let changed = 0
    for (const [model, price] of prices) {
      const preset = presetFor(model)
      const legacy = LEGACY_PRESET_PRICES[model]
      if (!preset || !legacy) continue
      if (hasValidPeakWindow(price.peak) || hasValidPeakWindow(price.peak2)) continue
      if ((price.peak && price.peak.enabled === false) || (price.peak2 && price.peak2.enabled === false)) continue
      const brokenPeak = (price.peak && price.peak.enabled === true) || (price.peak2 && price.peak2.enabled === true)
      const presetHasPeak = preset.peak || preset.peak2
      if (sameBasePrice(price, legacy) || (presetHasPeak && sameBasePrice(price, preset))) {
        prices.set(model, copyPreset(preset))
        changed++
      } else if (brokenPeak) {
        // 保留自定义基础价，仅关闭残缺的高峰窗口（用户可自行重新启用并补齐时段）。
        const next = { ...price, peak: price.peak ? { ...price.peak, enabled: false } : undefined, peak2: price.peak2 ? { ...price.peak2, enabled: false } : undefined }
        prices.set(model, next)
        changed++
      }
    }
    return changed
  }

  loadState()
  // 迁移旧默认价为最新官方默认预设（DeepSeek 两个高峰时段 + 官方定价）。
  // 仅在旧版本（version < 4）数据上执行一次；已迁移或新安装不重复处理。
  if (stateVersion !== null && stateVersion < 4 && migrateLegacyDefaults() > 0) schedulePersist()

  // 启动时若没有任何缓存汇率，自动刷新一次并写盘（失败静默，等待客户端按需重试）。
  if (ratesFetchedAt === null) refreshRates().catch(() => {})

  // ---------- 统计采集 ----------

  function ensure(model) {
    const key = String(model || 'unknown')
    let entry = stats.get(key)
    if (!entry) {
      entry = { calls: 0, failed: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, peakInputTokens: 0, peakCacheReadTokens: 0, peakCacheWriteTokens: 0, peakOutputTokens: 0, providers: [] }
      stats.set(key, entry)
    }
    return entry
  }

  // ---------- 峰谷时段判断 ----------

  // 解析 "HH:MM" 为当天分钟数；非法输入返回 null。
  function parseClock(value) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
    if (!m) return null
    const hour = Number(m[1])
    const minute = Number(m[2])
    if (hour > 23 || minute > 59) return null
    return hour * 60 + minute
  }

  // 判断某个时刻是否落在单个高峰窗口内（按服务器本地时间）。
  // start < end：高峰为 [start, end)；start > end：跨零点（如 22:00–06:00）；
  // start === end：视为未配置高峰时段。
  function inPeakWindow(window, date) {
    if (!window || window.enabled !== true) return false
    const start = parseClock(window.start)
    const end = parseClock(window.end)
    if (start === null || end === null || start === end) return false
    const now = date.getHours() * 60 + date.getMinutes()
    if (start < end) return now >= start && now < end
    return now >= start || now < end
  }

  // 模型是否落在任一高峰窗口：最多两个高峰时段（peak / peak2），
  // 两个窗口共用同一组高峰价，因此高峰 token 合并统计即可精确计费。
  // 总开关为 peak.enabled（峰谷定价开关），关闭时两个窗口都不生效。
  function inAnyPeakWindow(price, date) {
    if (!price || !price.peak || price.peak.enabled !== true) return false
    return inPeakWindow(price.peak, date) || inPeakWindow(price.peak2, date)
  }

  function presetFor(model) {
    const current = String(model || '')
    if (PRESET_PRICES[current]) return PRESET_PRICES[current]
    const key = current.replace(/:batch$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/^[a-z0-9-]+\//, '')
    return PRESET_PRICES[key] || undefined
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
    if (inAnyPeakWindow(prices.get(key), new Date())) {
      entry.peakInputTokens += usage.inputTokens || 0
      entry.peakCacheReadTokens += usage.cacheReadTokens || 0
      entry.peakCacheWriteTokens += usage.cacheWriteTokens || 0
      entry.peakOutputTokens += usage.outputTokens || 0
    }
    schedulePersist()
  }

  // 拦截每次流式模型调用：透传所有 chunk，只采集 usage。
  ctx.on('llm/stream', (options, next) => {
    const provider = options.provider
    const model = options.model
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

  function snapshot() {
    const rows = []
    for (const [model, entry] of stats) {
      rows.push({
        model,
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
        providers: entry.providers.slice(),
      })
    }
    rows.sort((a, b) => (b.calls + b.failed) - (a.calls + a.failed) || a.model.localeCompare(b.model))
    const priceMap = {}
    for (const [model, price] of prices) priceMap[model] = { ...price }
    return {
      rows,
      prices: priceMap,
      rates: { ...rates },
      ratesSource,
      ratesUpdatedAt,
      ratesFetchedAt,
      targetCurrency,
      balance: { ...balance, infos: balance.infos.slice() },
    }
  }

  async function handleAction(body) {
    const action = body && body.action
    switch (action) {
      case 'set-price': {
        const model = String((body && body.model) || '')
        if (!model) return { ok: false, error: 'missing model' }
        const src = (body && body.price) || {}
        const existing = prices.get(model)
        const peakSrc = (src.peak && typeof src.peak === 'object') ? src.peak : {}
        const peak2Src = (src.peak2 && typeof src.peak2 === 'object') ? src.peak2 : {}
        const hasValues = Number(src.input) > 0 || Number(src.output) > 0 || Number(src.cacheRead) > 0 || Number(src.cacheWrite) > 0
          || peakSrc.enabled === true
          || Number(peakSrc.input) > 0 || Number(peakSrc.output) > 0 || Number(peakSrc.cacheRead) > 0 || Number(peakSrc.cacheWrite) > 0
          || peak2Src.enabled === true
        // 未填任何价格（含峰谷配置）且该模型从未自定义/移除过价格时，套用默认预设，
        // 避免"添加模型"写入全零价格并阻断后续自动套用。
        if (!hasValues && !existing && !removed.has(model)) {
          const preset = presetFor(model)
          if (preset) {
            prices.set(model, copyPreset(preset))
            removed.delete(model)
            schedulePersist()
            return { ok: true }
          }
        }
        prices.set(model, {
          currency: normalizeCurrency(src.currency) || (existing && existing.currency) || 'USD',
          input: normalizePrice(src.input),
          output: normalizePrice(src.output),
          cacheRead: normalizePrice(src.cacheRead),
          cacheWrite: normalizePrice(src.cacheWrite),
          peak: {
            enabled: peakSrc.enabled === true,
            start: typeof peakSrc.start === 'string' ? peakSrc.start : '',
            end: typeof peakSrc.end === 'string' ? peakSrc.end : '',
            input: normalizePrice(peakSrc.input),
            output: normalizePrice(peakSrc.output),
            cacheRead: normalizePrice(peakSrc.cacheRead),
            cacheWrite: normalizePrice(peakSrc.cacheWrite),
          },
          peak2: {
            enabled: peak2Src.enabled === true,
            start: typeof peak2Src.start === 'string' ? peak2Src.start : '',
            end: typeof peak2Src.end === 'string' ? peak2Src.end : '',
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

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      let overflow = false
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > 1024 * 1024) {
          overflow = true
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (overflow) {
          reject(new Error('body too large'))
          return
        }
        try {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve(text.trim() ? JSON.parse(text) : {})
        } catch (err) {
          reject(err)
        }
      })
      req.on('error', reject)
    })
  }

  const disposers = []
  if (webServer !== undefined) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/__musage-stats',
      handler: (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, snapshot())
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, { ok: false, error: 'method not allowed' }, 405)
          return
        }
        readBody(req).then((body) => {
          return handleAction(body).then((result) => sendJson(res, result))
        }).catch(() => {
          sendJson(res, { ok: false, error: 'bad request' }, 400)
        })
      },
    }))
  }

  ctx.on('dispose', () => {
    disposed = true
    if (writeTimer !== null) {
      clearInterval(writeTimer)
      writeTimer = null
    }
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
