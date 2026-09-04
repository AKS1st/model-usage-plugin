/**
 * model-usage-plugin — browser half.
 *
 * 在 Web 设置的"模型消耗"页签渲染统计与价格配置。与 Host 半部通过
 * /__musage-stats 路由通信（GET 拉取快照，POST 提交操作），数据持久化
 * 由 Host 负责（$DSH_HOME/musage-stats.json）。
 */
import * as React from 'react'

export const inject = ['slots', 'locale']

const API = '/__musage-stats'
      const NS = 'model-usage-plugin'
      const ZH = {
        title: '模型消耗统计', totalTokens: '总 Token', cacheMiss: '未命中', balance: '账户余额', loading: '正在加载模型消耗数据…', retrying: '正在自动重试…', loadFailed: '加载失败：{error}', targetCurrency: '目标货币', rate: '汇率 USD→{target} {rate}', updatedAt: '更新于 {time}', live: '实时', defaultRate: '默认值', cacheHint: '缓存 7 天内，需手动刷新', refreshRates: '更新汇率', refreshing: '更新中…', queryBalance: '查询余额', querying: '查询中…', balanceConfig: '余额配置', collapseBalanceConfig: '收起余额配置', onlyUsed: '仅显示已调用模型', balanceKey: 'API Key（留空则用 DEEPSEEK_API_KEY）', balanceBaseUrl: '余额接口 Base URL', saveAndQuery: '保存并查询', error: '错误：{error}', calls: '调用', tokens: 'tokens', cost: '费用({target})', failed: '失败', callMeta: '{calls} 次调用', failedMeta: ' · 失败 {failed}', costMeta: ' · 费用 {cost} {target}', notConfigured: '（未配置价格）', unused: '尚未调用', peakTokens: '高峰 tokens：输入 {input} · 输出 {output} · 缓存命中 {read} · 缓存写入 {write}', pricingCurrency: '计价货币', input: '输入', output: '输出', cacheRead: '缓存命中', cacheWrite: '缓存写入', peakPricing: '峰谷定价（高峰期按高峰价，其余按正常价）', secondPeak: '启用第二个高峰时段', peakPeriod: '高峰时段 {n}', timeHint: 'HH:MM · 服务器本地时间 · 跨零点如 22:00–06:00', peakInput: '高峰输入', peakOutput: '高峰输出', peakCacheRead: '高峰缓存命中', peakCacheWrite: '高峰缓存写入', sharedPeak: '两个高峰时段共用同一组高峰价；高峰价留空则按正常价计费', normalPeak: '高峰价留空则按正常价计费', saving: '保存中…', save: '保存', reset: '重置', remove: '移除', unit: '单价单位：{currency} / 百万 tokens · 展示按目标货币换算', adjust: '调整价格', configure: '配置价格', modelPlaceholder: '模型 id，如 deepseek-chat（预配置价格）', add: '添加', emptyUsed: '暂无模型调用记录，发送消息后自动统计（取消勾选“仅显示已调用模型”可查看价格配置）', empty: '暂无模型，可通过下方输入框添加', balanceLoading: '查询中…', balanceError: '查询失败', balanceNone: '未查询', balanceUpdated: '余额更新于 {time}', balanceQuerying: '正在查询账户余额…', balanceHint: '点击“查询余额”获取', errorPrefix: '错误：{error}', emptyUsed: '暂无模型调用记录，发送消息后自动统计（取消勾选“仅显示已调用模型”可查看价格配置）', empty: '暂无模型，可通过下方输入框添加', modelPlaceholder: '模型 id，如 deepseek-chat（预配置价格）', add: '添加', sharedPeak: '两个高峰时段共用同一组高峰价；高峰价留空则按正常价计费', normalPeak: '高峰价留空则按正常价计费', save: '保存', saving: '保存中…', reset: '重置', remove: '移除', unit: '单价单位：{currency} / 百万 tokens · 展示按目标货币换算', adjust: '调整价格', configure: '配置价格' }
      const EN = { title: 'Model usage statistics', totalTokens: 'Total tokens', balance: 'Account balance', loading: 'Loading model usage data…', retrying: 'Retrying automatically…', loadFailed: 'Load failed: {error}', targetCurrency: 'Target currency', rate: 'USD→{target} rate {rate}', updatedAt: 'Updated {time}', live: 'Live', defaultRate: 'Default', cacheHint: 'Cached for 7 days; refresh manually', refreshRates: 'Refresh rates', refreshing: 'Refreshing…', queryBalance: 'Query balance', querying: 'Querying…', balanceConfig: 'Balance settings', collapseBalanceConfig: 'Hide balance settings', onlyUsed: 'Show used models only', balanceKey: 'API key (leave blank to use DEEPSEEK_API_KEY)', balanceBaseUrl: 'Balance API base URL', saveAndQuery: 'Save and query', error: 'Error: {error}', calls: 'Calls', tokens: 'Tokens', cost: 'Cost ({target})', failed: 'Failed', callMeta: '{calls} calls', failedMeta: ' · {failed} failed', costMeta: ' · Cost {cost} {target}', notConfigured: ' (price not configured)', unused: 'Not called yet', peakTokens: 'Peak tokens: input {input} · output {output} · cache read {read} · cache write {write}', pricingCurrency: 'Pricing currency', input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write', peakPricing: 'Peak/off-peak pricing (peak rates apply during peak hours)', secondPeak: 'Enable second peak period', peakPeriod: 'Peak period {n}', timeHint: 'HH:MM · server local time · overnight ranges e.g. 22:00–06:00', peakInput: 'Peak input', peakOutput: 'Peak output', peakCacheRead: 'Peak cache read', peakCacheWrite: 'Peak cache write', sharedPeak: 'Both peak periods use the same peak rates; blank peak rates use normal rates', normalPeak: 'Blank peak rates use normal rates', saving: 'Saving…', save: 'Save', reset: 'Reset', remove: 'Remove', unit: 'Unit price: {currency} / million tokens · displayed in target currency', adjust: 'Adjust price', configure: 'Configure price', modelPlaceholder: 'Model ID, e.g. deepseek-chat (preset price)', add: 'Add', emptyUsed: 'No model usage yet; send a message to collect usage (uncheck “Show used models only” to view prices)', empty: 'No models; add one using the field below', balanceLoading: 'Querying…', balanceError: 'Query failed', balanceNone: 'Not queried', balanceUpdated: 'Balance updated {time}', balanceQuerying: 'Querying account balance…', balanceHint: 'Click “Query balance” to fetch', errorPrefix: 'Error: {error}', emptyUsed: 'No model calls yet; send a message to collect usage (clear “Show used models only” to view price configuration)', empty: 'No models; add one below', modelPlaceholder: 'Model ID, e.g. deepseek-chat (preset price)', add: 'Add', sharedPeak: 'Both peak periods use the same peak rates; blank peak rates use normal rates', normalPeak: 'Blank peak rates use normal rates', save: 'Save', saving: 'Saving…', reset: 'Reset', remove: 'Remove', unit: 'Unit price: {currency} / million tokens · displayed in target currency', adjust: 'Adjust price', configure: 'Configure price' }
      const interpolate = (value, params) => String(value).replace(/\{(\w+)\}/g, (_, key) => params && params[key] !== undefined ? params[key] : '{' + key + '}')
      const fallbackT = (key, params) => interpolate(EN[key] || key, params)

      const getStats = () => fetch(API, { cache: 'no-store' }).then((res) => res.json())
      const postAction = (body) => fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((res) => res.json())

export function apply(ctx) {
          const slots = ctx.get('slots')
          if (slots === undefined) return
          const locale = ctx.get('locale')
          let translate = fallbackT
          if (locale !== undefined) {
            ctx.effect(() => {
              const offZh = locale.register(NS, 'zh', ZH)
              const offEn = locale.register(NS, 'en', EN)
              return () => { offZh(); offEn() }
            }, 'model-usage-plugin: dictionaries')
            translate = locale.bind(NS)
          }

          const styleEl = document.createElement('style')
          styleEl.textContent = `
            .mu-page { padding: 2px 0 16px; font-size: 13px; color: var(--dsw-alias-label-primary); }
            .mu-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
            .mu-title { font-size: 15px; font-weight: 600; margin-right: auto; }
            .mu-btn { padding: 4px 12px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; }
            .mu-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
            .mu-btn:disabled { opacity: 0.5; cursor: default; }
            .mu-cur { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-cur-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
            .mu-select { padding: 3px 6px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
            .mu-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
            .mu-rate { font-size: 11px; color: var(--dsw-alias-label-secondary); }
            .mu-badge-live { font-size: 11px; padding: 1px 6px; border-radius: 6px; background: var(--dsw-alias-state-success-primary); color: #fff; }
            .mu-badge-default { font-size: 11px; padding: 1px 6px; border-radius: 6px; background: var(--dsw-alias-state-warn-primary); color: #fff; }
            .mu-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
            .mu-chip { display: flex; align-items: baseline; gap: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-chip-label { font-size: 11px; color: var(--dsw-alias-label-secondary); }
            .mu-chip-value { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
            .mu-list { display: flex; flex-direction: column; gap: 10px; }
            .mu-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; }
            .mu-card-head { display: flex; align-items: baseline; gap: 8px; }
            .mu-model { font-weight: 600; font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-provider { font-size: 11px; color: var(--dsw-alias-label-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-meta { margin-left: auto; flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
            .mu-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 10px; margin-top: 10px; }
            .mu-cell { min-width: 0; }
            .mu-cell-label { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .mu-cell-value { font-size: 13px; font-variant-numeric: tabular-nums; }
            .mu-price-toggle { margin-top: 10px; font-size: 12px; color: var(--dsw-alias-brand-primary); background: none; border: none; padding: 0; cursor: pointer; }
            .mu-price-toggle:hover { text-decoration: underline; }
            .mu-price { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
            .mu-price-cur { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
            .mu-price-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
            .mu-field-label { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-bottom: 3px; }
            .mu-input { width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
            .mu-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
            .mu-price-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
            .mu-peak { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
            .mu-peak-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-primary); cursor: pointer; }
            .mu-peak-body { margin-top: 8px; }
            .mu-peak-time { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
            .mu-peak-stats { margin-top: 6px; font-size: 11px; color: var(--dsw-alias-state-warn-primary); }
            .mu-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); font-weight: 400; }
            .mu-error { color: var(--dsw-alias-state-error-primary); margin-bottom: 10px; }
            .mu-empty { color: var(--dsw-alias-label-secondary); padding: 14px 0; text-align: center; }
            .mu-add { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
            .mu-big { display: flex; gap: 10px; margin-bottom: 12px; }
            .mu-big-card { flex: 1; min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 10px 14px; }
            .mu-big-value { font-size: 26px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-big-label { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
            .mu-big-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
            .mu-big-value.err { color: var(--dsw-alias-state-error-primary); font-size: 18px; }
            .mu-big-value.wait { color: var(--dsw-alias-label-secondary); font-size: 18px; }
            .mu-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; margin-left: auto; }
            .mu-bconf { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-bconf-label { font-size: 11px; color: var(--dsw-alias-label-secondary); }
          `
          document.head.appendChild(styleEl)
          ctx.on('dispose', () => {
            if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl)
          })

          const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD', 'CAD']
          const fmt = (n) => Number(n || 0).toLocaleString()
          const fmtMoney = (n) => {
            if (!Number.isFinite(n)) return '-'
            if (n === 0) return '0'
            return n.toFixed(6).replace(/\.?0+$/, '')
          }
          const fmtRate = (n) => (Number.isFinite(n) ? n.toFixed(4) : '-')
          // Host 侧时间戳为 UTC ISO 字符串，展示时需转为浏览器本地时间，
          // 否则显示的"更新于"时间与真实本地时间相差一个时区。
          const fmtTs = (iso) => {
            if (!iso) return '-'
            const d = new Date(iso)
            if (Number.isNaN(d.getTime())) return '-'
            const pad = (n) => String(n).padStart(2, '0')
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
              + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
          }

          // 汇率缓存有效期：一周（毫秒）。缓存不超过一周时不自动刷新，
          // 需手动点击"更新汇率"；无缓存或缓存超过一周时自动刷新一次。
          const RATES_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000
          const needsAutoRefreshRates = (res) => {
            if (!res || res.ratesSource !== 'live' || !res.ratesFetchedAt) return true
            const t = new Date(res.ratesFetchedAt).getTime()
            if (!Number.isFinite(t)) return true
            return Date.now() - t > RATES_CACHE_MAX_AGE
          }

          // 与 index.js 的 PRESET_PRICES 保持一致：重置按钮在客户端直接按
          // 预设价写回（走既有 set-price 动作），避免新增宿主动作需重启。
          const PRESET_PRICES = {
            // DeepSeek（国产，CNY 元 / 百万 tokens）
            // 2026-08-17 起官方改为峰谷计费：高峰时段（每日 09:00–12:00、14:00–18:00，
            // 服务器本地时间）价格为空闲时段 2 倍；V4 系列预置两个官方高峰时段。
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
          const presetFor = (model) => {
            const current = String(model || '')
            if (PRESET_PRICES[current]) return PRESET_PRICES[current]
            const key = current.replace(/:batch$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/^[a-z0-9-]+\//, '')
            return PRESET_PRICES[key] || undefined
          }

          function ModelUsagePage(props) {
            const t = props && typeof props.t === 'function' ? props.t : translate
            const [view, setView] = React.useState(null)
            const [drafts, setDrafts] = React.useState({})
            const [open, setOpen] = React.useState({})
            const [newModel, setNewModel] = React.useState('')
            const [error, setError] = React.useState(null)
            const [saving, setSaving] = React.useState(null)
            const [busy, setBusy] = React.useState(null)
            const [onlyUsed, setOnlyUsed] = React.useState(true)
            const [bconfOpen, setBconfOpen] = React.useState(false)
            const [bconfApiKey, setBconfApiKey] = React.useState('')
            const [bconfBaseUrl, setBconfBaseUrl] = React.useState('')
            const [balBusy, setBalBusy] = React.useState(false)

            const refresh = React.useCallback(() => {
              return getStats().then((res) => {
                setView(res)
                setError(null)
                return res
              }).catch((err) => {
                setError((err && err.message) || String(err))
                return null
              })
            }, [])

            React.useEffect(() => {
              refresh().then((res) => {
                // 缓存策略：无缓存或缓存超过一周时自动刷新一次；
                // 缓存不超过一周时不自动刷新，仅手动点击"更新汇率"。
                if (needsAutoRefreshRates(res)) {
                  setBusy('rates')
                  postAction({ action: 'refresh-rates' })
                    .then(() => { setBusy(null); refresh() })
                    .catch(() => { setBusy(null); refresh() })
                }
              })
              postAction({ action: 'refresh-balance' }).then(refresh).catch(() => refresh())
              const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 5000)
              return () => window.clearInterval(timer)
            }, [refresh])

            if (view === null) {
              return React.createElement('div', { className: 'mu-page' },
                React.createElement('div', { className: 'mu-error' }, error ? t('loadFailed', { error }) : ''),
                React.createElement('div', null, error ? t('retrying') : t('loading')))
            }

            const rows = view.rows || []
            const priceMap = view.prices || {}
            const rates = view.rates || {}
            const target = view.targetCurrency || 'CNY'
            const rateOf = (code) => {
              const v = Number(rates[code])
              return Number.isFinite(v) && v > 0 ? v : 1
            }
            const priceOf = (model) => {
              const p = priceMap[model]
              return p
                ? { currency: p.currency || 'USD', input: p.input, output: p.output, cacheRead: p.cacheRead, cacheWrite: p.cacheWrite, peak: p.peak || null, peak2: p.peak2 || null }
                : { currency: 'USD', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, peak: null, peak2: null }
            }
            const rowOf = (model) => rows.find((r) => r.model === model)
            const costOf = (model) => {
              const row = rowOf(model)
              if (!row) return null
              const p = priceOf(model)
              if (!(p.input > 0 || p.output > 0 || p.cacheRead > 0 || p.cacheWrite > 0)) return null
              const peak = p.peak && p.peak.enabled ? p.peak : null
              // 高峰价留空/为 0 时按正常价计算；非高峰一律按正常价。
              const peakPrice = (normal, peakVal) => (peak && peakVal > 0 ? peakVal : normal)
              const own = (
                (row.inputTokens - row.peakInputTokens) * p.input + row.peakInputTokens * peakPrice(p.input, peak && peak.input)
                + (row.cacheReadTokens - row.peakCacheReadTokens) * p.cacheRead + row.peakCacheReadTokens * peakPrice(p.cacheRead, peak && peak.cacheRead)
                + (row.cacheWriteTokens - row.peakCacheWriteTokens) * p.cacheWrite + row.peakCacheWriteTokens * peakPrice(p.cacheWrite, peak && peak.cacheWrite)
                + (row.outputTokens - row.peakOutputTokens) * p.output + row.peakOutputTokens * peakPrice(p.output, peak && peak.output)
              ) / 1e6
              return (own / rateOf(p.currency)) * rateOf(target)
            }
            const draftOf = (model) => {
              const d = drafts[model]
              if (d) return d
              const p = priceOf(model)
              const peak = p.peak || {}
              const peak2 = p.peak2 || {}
              return {
                currency: p.currency,
                input: String(p.input || ''),
                output: String(p.output || ''),
                cacheRead: String(p.cacheRead || ''),
                cacheWrite: String(p.cacheWrite || ''),
                peakEnabled: peak.enabled === true,
                peakStart: peak.start || '',
                peakEnd: peak.end || '',
                peakInput: String(peak.input > 0 ? peak.input : ''),
                peakOutput: String(peak.output > 0 ? peak.output : ''),
                peakCacheRead: String(peak.cacheRead > 0 ? peak.cacheRead : ''),
                peakCacheWrite: String(peak.cacheWrite > 0 ? peak.cacheWrite : ''),
                peak2Enabled: peak2.enabled === true,
                peak2Start: peak2.start || '',
                peak2End: peak2.end || '',
              }
            }
            const setDraft = (model, field, value) => {
              setDrafts((prev) => {
                const base = prev[model] || draftOf(model)
                return { ...prev, [model]: { ...base, [field]: value } }
              })
            }
            const clearDraft = (model) => {
              setDrafts((prev) => {
                if (!(model in prev)) return prev
                const next = { ...prev }
                delete next[model]
                return next
              })
            }
            const togglePrice = (model) => setOpen((prev) => ({ ...prev, [model]: !prev[model] }))
            const savePrice = (model) => {
              const d = draftOf(model)
              setSaving(model)
              postAction({
                action: 'set-price', model,
                price: {
                  currency: d.currency,
                  input: d.input,
                  output: d.output,
                  cacheRead: d.cacheRead,
                  cacheWrite: d.cacheWrite,
                  peak: {
                    enabled: !!d.peakEnabled,
                    start: d.peakStart || '',
                    end: d.peakEnd || '',
                    input: d.peakInput,
                    output: d.peakOutput,
                    cacheRead: d.peakCacheRead,
                    cacheWrite: d.peakCacheWrite,
                  },
                  peak2: {
                    enabled: !!d.peak2Enabled,
                    start: d.peak2Start || '',
                    end: d.peak2End || '',
                  },
                },
              })
                .then(() => { setSaving(null); refresh() })
                .catch((err) => { setSaving(null); setError((err && err.message) || String(err)) })
            }
            const removePrice = (model) => {
              postAction({ action: 'remove-price', model })
                .then(() => { clearDraft(model); refresh() })
                .catch((err) => setError((err && err.message) || String(err)))
            }
            const resetPrice = (model) => {
              const preset = presetFor(model)
              if (!preset) return
              postAction({ action: 'set-price', model, price: preset })
                .then(() => { clearDraft(model); refresh() })
                .catch((err) => setError((err && err.message) || String(err)))
            }
            const setTarget = (currency) => {
              postAction({ action: 'set-target-currency', currency }).then(refresh).catch((err) => setError((err && err.message) || String(err)))
            }
            const refreshRates = () => {
              setBusy('rates')
              postAction({ action: 'refresh-rates' }).then(() => { setBusy(null); refresh() }).catch((err) => { setBusy(null); setError((err && err.message) || String(err)) })
            }
            const addModel = () => {
              const model = newModel.trim()
              if (!model) return
              postAction({ action: 'set-price', model, price: {} })
                .then(() => { setNewModel(''); refresh() })
                .catch((err) => setError((err && err.message) || String(err)))
            }
            const refreshBalance = () => {
              setBalBusy(true)
              postAction({ action: 'refresh-balance' }).then(() => { setBalBusy(false); refresh() }).catch((err) => { setBalBusy(false); setError((err && err.message) || String(err)) })
            }
            const saveBconf = () => {
              postAction({ action: 'set-balance-config', apiKey: bconfApiKey, baseUrl: bconfBaseUrl })
                .then(() => { setBconfOpen(false); refreshBalance() })
                .catch((err) => setError((err && err.message) || String(err)))
            }

            const modelSet = new Set(rows.map((r) => r.model))
            for (const key of Object.keys(priceMap)) modelSet.add(key)
            const allModels = Array.from(modelSet).sort((a, b) => {
              const ra = rowOf(a)
              const rb = rowOf(b)
              const ca = ra ? ra.calls + ra.failed : 0
              const cb = rb ? rb.calls + rb.failed : 0
              return cb - ca || a.localeCompare(b)
            })

            const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0)
            const totalFailed = rows.reduce((sum, r) => sum + r.failed, 0)
            const totalTokens = rows.reduce((sum, r) => sum + r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens + r.outputTokens, 0)
            const totalCost = rows.reduce((sum, r) => sum + (costOf(r.model) || 0), 0)

            const balance = view.balance || { status: 'none', total: null, currency: null, infos: [], updatedAt: null, message: null }
            const balClass = balance.status === 'ok' ? 'mu-big-value' : (balance.status === 'error' ? 'mu-big-value err' : 'mu-big-value wait')
            const balValue = balance.status === 'ok'
              ? fmtMoney(balance.total) + ' ' + (balance.currency || '')
              : (balance.status === 'loading' ? t('balanceLoading') : (balance.status === 'error' ? t('balanceError') : t('balanceNone')))
            const balSub = balance.status === 'ok'
              ? (balance.infos.length > 1
                  ? balance.infos.map((i) => i.currency + ' ' + fmtMoney(i.total)).join(' · ')
                  : t('balanceUpdated', { time: balance.updatedAt ? fmtTs(balance.updatedAt) : '-' }))
              : (balance.status === 'error'
                  ? (balance.message || t('balanceError'))
                  : (balance.status === 'loading' ? t('balanceQuerying') : t('balanceHint')))

            const shownModels = onlyUsed ? allModels.filter((m) => rowOf(m)) : allModels

            const chip = (label, value) => React.createElement('div', { className: 'mu-chip' },
              React.createElement('span', { className: 'mu-chip-label' }, label),
              React.createElement('span', { className: 'mu-chip-value' }, value))
            const cell = (label, value) => React.createElement('div', { className: 'mu-cell' },
              React.createElement('div', { className: 'mu-cell-label' }, label),
              React.createElement('div', { className: 'mu-cell-value' }, value))
            const field = (model, keyName, label, value) => React.createElement('div', { className: 'mu-field' },
              React.createElement('div', { className: 'mu-field-label' }, label),
              React.createElement('input', { className: 'mu-input', type: 'number', min: '0', step: 'any', placeholder: '0', value, onChange: (e) => setDraft(model, keyName, e.target.value) }))
            const curOptions = CURRENCIES.map((c) => React.createElement('option', { key: c, value: c }, c))

            const head = React.createElement('div', { className: 'mu-head' },
              React.createElement('div', { className: 'mu-title' }, t('title')))

            const bigMetrics = React.createElement('div', { className: 'mu-big' },
              React.createElement('div', { className: 'mu-big-card' },
                React.createElement('div', { className: 'mu-big-value' }, fmt(totalTokens)),
                React.createElement('div', { className: 'mu-big-label' }, t('totalTokens'))),
              React.createElement('div', { className: 'mu-big-card' },
                React.createElement('div', { className: balClass }, balValue),
                React.createElement('div', { className: 'mu-big-label' }, t('balance')),
                React.createElement('div', { className: 'mu-big-sub' }, balSub)))

            const ratesFresh = view.ratesSource === 'live' && !needsAutoRefreshRates(view)
            const ratesTime = view.ratesFetchedAt ? fmtTs(view.ratesFetchedAt) : null
            const curRow = React.createElement('div', { className: 'mu-cur' },
              React.createElement('span', { className: 'mu-cur-label' }, t('targetCurrency')),
              React.createElement('select', { className: 'mu-select', value: target, onChange: (e) => setTarget(e.target.value) }, curOptions),
              React.createElement('span', { className: 'mu-rate' }, t('rate', { target, rate: fmtRate(rateOf(target)) }) + (ratesTime ? ' · ' + t('updatedAt', { time: ratesTime }) : '')),
              React.createElement('span', { className: view.ratesSource === 'live' ? 'mu-badge-live' : 'mu-badge-default' }, view.ratesSource === 'live' ? t('live') : t('defaultRate')),
              ratesFresh ? React.createElement('span', { className: 'mu-hint' }, t('cacheHint')) : null,
              React.createElement('button', { className: 'mu-btn', disabled: busy === 'rates', onClick: refreshRates }, busy === 'rates' ? t('refreshing') : t('refreshRates')),
              React.createElement('button', { className: 'mu-btn', disabled: balBusy, onClick: refreshBalance }, balBusy ? t('querying') : t('queryBalance')),
              React.createElement('button', { className: 'mu-btn', onClick: () => setBconfOpen((v) => !v) }, bconfOpen ? t('collapseBalanceConfig') : t('balanceConfig')),
              React.createElement('label', { className: 'mu-toggle' },
                React.createElement('input', { type: 'checkbox', checked: onlyUsed, onChange: (e) => setOnlyUsed(e.target.checked) }),
                t('onlyUsed')))

            const bconf = bconfOpen ? React.createElement('div', { className: 'mu-bconf' },
              React.createElement('span', { className: 'mu-bconf-label' }, t('balanceKey')),
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '200px' }, type: 'password', placeholder: 'sk-...', value: bconfApiKey, onChange: (e) => setBconfApiKey(e.target.value) }),
              React.createElement('span', { className: 'mu-bconf-label' }, t('balanceBaseUrl')),
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '200px' }, placeholder: 'https://api.deepseek.com', value: bconfBaseUrl, onChange: (e) => setBconfBaseUrl(e.target.value) }),
              React.createElement('button', { className: 'mu-btn', onClick: saveBconf }, t('saveAndQuery'))) : null

            const summary = React.createElement('div', { className: 'mu-summary' },
              chip(t('calls'), fmt(totalCalls)),
              chip(t('tokens'), fmt(totalTokens)),
              chip(t('cost', { target }), fmtMoney(totalCost)),
              chip(t('failed'), fmt(totalFailed)))

            const cards = shownModels.map((model) => {
              const row = rowOf(model)
              const d = draftOf(model)
              const cost = row ? costOf(model) : null
              const hasPrice = !!priceMap[model]
              const expanded = !!open[model]
              const meta = row
                ? t('callMeta', { calls: fmt(row.calls) }) + (row.failed ? t('failedMeta', { failed: row.failed }) : '') + t('costMeta', { cost: cost === null ? '-' : fmtMoney(cost), target }) + (cost === null && !hasPrice ? t('notConfigured') : '')
                : t('unused')
              return React.createElement('div', { className: 'mu-card', key: model },
                React.createElement('div', { className: 'mu-card-head' },
                  React.createElement('div', { className: 'mu-model', title: model }, model),
                  row ? React.createElement('div', { className: 'mu-provider', title: row.providers.join(', ') }, row.providers.join(', ')) : null,
                  React.createElement('div', { className: 'mu-meta' }, meta)),
                row ? React.createElement('div', { className: 'mu-grid' },
                  cell(t('cacheMiss'), fmt(row.inputTokens)),
                  cell(t('cacheRead'), fmt(row.cacheReadTokens)),
                  cell(t('cacheWrite'), fmt(row.cacheWriteTokens)),
                  cell(t('output'), fmt(row.outputTokens))) : null,
                row && d.peakEnabled && (row.peakInputTokens > 0 || row.peakOutputTokens > 0 || row.peakCacheReadTokens > 0 || row.peakCacheWriteTokens > 0)
                  ? React.createElement('div', { className: 'mu-peak-stats' },
                      t('peakTokens', { input: fmt(row.peakInputTokens), output: fmt(row.peakOutputTokens), read: fmt(row.peakCacheReadTokens), write: fmt(row.peakCacheWriteTokens) }))
                  : null,
                expanded
                  ? React.createElement('div', { className: 'mu-price' },
                      React.createElement('div', { className: 'mu-price-cur' },
                        React.createElement('span', { className: 'mu-field-label' }, t('pricingCurrency')),
                        React.createElement('select', { className: 'mu-select', value: d.currency || 'USD', onChange: (e) => setDraft(model, 'currency', e.target.value) }, curOptions)),
                      React.createElement('div', { className: 'mu-price-grid' },
                        field(model, 'input', t('input'), d.input),
                        field(model, 'output', t('output'), d.output),
                        field(model, 'cacheRead', t('cacheRead'), d.cacheRead),
                        field(model, 'cacheWrite', t('cacheWrite'), d.cacheWrite)),
                      React.createElement('div', { className: 'mu-peak' },
                        React.createElement('div', { className: 'mu-peak-time' },
                          React.createElement('label', { className: 'mu-peak-toggle' },
                            React.createElement('input', { type: 'checkbox', checked: !!d.peakEnabled, onChange: (e) => setDraft(model, 'peakEnabled', e.target.checked) }),
                            t('peakPricing')),
                          d.peakEnabled
                            ? React.createElement('label', { className: 'mu-peak-toggle' },
                                React.createElement('input', { type: 'checkbox', checked: !!d.peak2Enabled, onChange: (e) => setDraft(model, 'peak2Enabled', e.target.checked) }),
                                t('secondPeak'))
                            : null),
                        d.peakEnabled
                          ? React.createElement('div', { className: 'mu-peak-body' },
                              React.createElement('div', { className: 'mu-peak-time' },
                                React.createElement('span', { className: 'mu-field-label' }, t('peakPeriod', { n: 1 })),
                                React.createElement('input', { className: 'mu-input', style: { maxWidth: '64px' }, placeholder: '09:00', value: d.peakStart || '', onChange: (e) => setDraft(model, 'peakStart', e.target.value) }),
                                React.createElement('span', null, '—'),
                                React.createElement('input', { className: 'mu-input', style: { maxWidth: '64px' }, placeholder: '12:00', value: d.peakEnd || '', onChange: (e) => setDraft(model, 'peakEnd', e.target.value) }),
                                React.createElement('span', { className: 'mu-hint' }, t('timeHint'))),
                              d.peak2Enabled
                                ? React.createElement('div', { className: 'mu-peak-time' },
                                    React.createElement('span', { className: 'mu-field-label' }, t('peakPeriod', { n: 2 })),
                                    React.createElement('input', { className: 'mu-input', style: { maxWidth: '64px' }, placeholder: '14:00', value: d.peak2Start || '', onChange: (e) => setDraft(model, 'peak2Start', e.target.value) }),
                                    React.createElement('span', null, '—'),
                                    React.createElement('input', { className: 'mu-input', style: { maxWidth: '64px' }, placeholder: '18:00', value: d.peak2End || '', onChange: (e) => setDraft(model, 'peak2End', e.target.value) }))
                                : null,
                              React.createElement('div', { className: 'mu-price-grid' },
                                field(model, 'peakInput', t('peakInput'), d.peakInput),
                                field(model, 'peakOutput', t('peakOutput'), d.peakOutput),
                                field(model, 'peakCacheRead', t('peakCacheRead'), d.peakCacheRead),
                                field(model, 'peakCacheWrite', t('peakCacheWrite'), d.peakCacheWrite)),
                              React.createElement('div', { className: 'mu-hint' }, d.peak2Enabled ? t('sharedPeak') : t('normalPeak')))
                          : null),
                      React.createElement('div', { className: 'mu-price-actions' },
                        React.createElement('button', { className: 'mu-btn', disabled: saving === model, onClick: () => savePrice(model) }, saving === model ? t('saving') : t('save')),
                        React.createElement('button', { className: 'mu-btn', disabled: !presetFor(model), onClick: () => resetPrice(model) }, t('reset')),
                        React.createElement('button', { className: 'mu-btn', disabled: !hasPrice, onClick: () => removePrice(model) }, t('remove')),
                        React.createElement('span', { className: 'mu-hint' }, t('unit', { currency: d.currency || 'USD' }))))
                  : React.createElement('button', { className: 'mu-price-toggle', onClick: () => togglePrice(model) }, (hasPrice ? t('adjust') : t('configure')) + ' ▾'))
            })

            const addRow = React.createElement('div', { className: 'mu-add' },
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '240px' }, placeholder: t('modelPlaceholder'), value: newModel, onChange: (e) => setNewModel(e.target.value) }),
              React.createElement('button', { className: 'mu-btn', onClick: addModel }, t('add')))

            return React.createElement('div', { className: 'mu-page' },
              head,
              bigMetrics,
              curRow,
              bconf,
              error ? React.createElement('div', { className: 'mu-error' }, t('errorPrefix', { error })) : null,
              summary,
              React.createElement('div', { className: 'mu-list' }, cards.length ? cards : React.createElement('div', { className: 'mu-empty' }, onlyUsed ? t('emptyUsed') : t('empty'))),
              addRow)
          }

          slots.inject('settings.section', () => slots.register(
            { name: 'settings.section', id: 'model-usage', order: 30, label: () => translate('title'), locale: NS },
            (props) => React.createElement(ModelUsagePage, props),
          ))
        }

