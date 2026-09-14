/**
 * model-usage-plugin — browser half.
 *
 * 在 Web 设置的"模型消耗"页签渲染统计与价格配置。与 Host 半部通过
 * /__musage-stats 路由通信（GET 拉取快照，POST 提交操作），数据持久化
 * 由 Host 负责（$DSH_HOME/musage-stats.json）。
 */
// 宿主把 exports["./client"] 的字节原样拼进 /plugins combo，并由浏览器以
// 经典 <script> 执行：顶层 import/export 会让整条 combo 语法失败，因此这里
// 必须与 harness tsdown 客户端产物同形，注册一个 require 闭包工厂。
if (typeof window !== 'undefined' && typeof window.__ModuleLoader__ !== 'undefined') {
  window.__ModuleLoader__.load({
    id: 'model-usage-plugin',
    factory(require) {
      const React = require('react')
      const API = '/__musage-stats'
      const NS = 'model-usage-plugin'
      const ZH = {
        title: '模型消耗统计', totalTokens: '总 Token', cacheMiss: '未命中', heatBackfilled: '已回填 {days} 天历史', mergedFrom: '由同一模型服务，合并了这些 id：{ids}', mergedIds: '合并 {n} 个 id', versionHint: '当前运行中的插件版本', heatEmpty: '从本版本开始累积，有调用后逐日填充', heatTitle: '开发活跃度', heatLess: '少', heatMore: '多', heatActiveDays: '活跃 {days} 天', heatTotal: '合计 {value}', latest: '最新', byTools: '工具', effToolCalls: '工具调用', effFailRate: '失败率', effPerCall: '每调用均价', effTokensPerCall: '每调用 Token', effTopTools: '高频工具', tabOverview: '总览', tabModels: '模型明细', tabConfig: '配置', openModels: '查看全部模型明细', advanced: '配置', shareTitle: '花费去向', expandHint: '点击展开 token 明细与价格配置', totalCost: '本期花费', shareCost: '花费去向（按费用）', shareTokens: '用量占比（按 Token）', advanced: '汇率、余额与价格配置', andMore: '另有 {n} 个模型未显示', cacheHitValue: '缓存命中 {pct}%', cacheHitShort: '命中 {pct}%', cacheHintNone: '缓存命中 —', callsShort: '{calls} 次调用', failedShort: '失败 {failed}', noUsage: '尚未调用', trendTitle: '用量趋势',trendEmpty: '还没有时间维数据。时间台账从本版本开始记录，发几条消息后这里会出现趋势。',byDay: '按天',byHour: '按小时',byTokens: 'Tokens',byCost: '费用',axisMax: '峰值 {value}',other: '其他',cacheHit: '缓存命中',composeTitle: '按模型的 Token 占比', balance: '账户余额', loading: '正在加载模型消耗数据…', retrying: '正在自动重试…', loadFailed: '加载失败：{error}', targetCurrency: '目标货币', rate: '汇率 USD→{target} {rate}', updatedAt: '更新于 {time}', live: '实时', defaultRate: '默认值', cacheHint: '缓存 7 天内，需手动刷新', refreshRates: '更新汇率', refreshing: '更新中…', queryBalance: '查询余额', querying: '查询中…', balanceConfig: '余额配置', collapseBalanceConfig: '收起余额配置', onlyUsed: '仅显示已调用模型', balanceKey: 'API Key（留空则用 DEEPSEEK_API_KEY）', balanceBaseUrl: '余额接口 Base URL', saveAndQuery: '保存并查询', error: '错误：{error}', calls: '调用', tokens: 'tokens', cost: '费用({target})', failed: '失败', callMeta: '{calls} 次调用', failedMeta: ' · 失败 {failed}', costMeta: ' · 费用 {cost} {target}', notConfigured: '（未配置价格）', unused: '尚未调用', peakTokens: '高峰 tokens：输入 {input} · 输出 {output} · 缓存命中 {read} · 缓存写入 {write}', pricingCurrency: '计价货币', input: '输入', output: '输出', cacheRead: '缓存命中', cacheWrite: '缓存写入', peakPricing: '峰谷定价（高峰期按高峰价，其余按正常价）', secondPeak: '启用第二个高峰时段', peakPeriod: '高峰时段 {n}', timeHint: 'HH:MM · 按所选时区解释（DeepSeek 官方高峰窗口为 UTC）· 跨零点如 22:00–06:00', weekdaysOnly: '仅周一至周五', peakInput: '高峰输入', peakOutput: '高峰输出', peakCacheRead: '高峰缓存命中', peakCacheWrite: '高峰缓存写入', sharedPeak: '两个高峰时段共用同一组高峰价；高峰价留空则按正常价计费', normalPeak: '高峰价留空则按正常价计费', saving: '保存中…', save: '保存', reset: '重置', remove: '移除', unit: '单价单位：{currency} / 百万 tokens · 展示按目标货币换算', adjust: '调整价格', configure: '配置价格', modelPlaceholder: '模型 id，如 deepseek-chat（预配置价格）', add: '添加', emptyUsed: '暂无模型调用记录，发送消息后自动统计（取消勾选“仅显示已调用模型”可查看价格配置）', empty: '暂无模型，可通过下方输入框添加', balanceLoading: '查询中…', balanceError: '查询失败', balanceNone: '未查询', balanceUpdated: '余额更新于 {time}', balanceQuerying: '正在查询账户余额…', balanceHint: '点击“查询余额”获取', errorPrefix: '错误：{error}', emptyUsed: '暂无模型调用记录，发送消息后自动统计（取消勾选“仅显示已调用模型”可查看价格配置）', empty: '暂无模型，可通过下方输入框添加', modelPlaceholder: '模型 id，如 deepseek-chat（预配置价格）', add: '添加', sharedPeak: '两个高峰时段共用同一组高峰价；高峰价留空则按正常价计费', normalPeak: '高峰价留空则按正常价计费', save: '保存', saving: '保存中…', reset: '重置', remove: '移除', unit: '单价单位：{currency} / 百万 tokens · 展示按目标货币换算', adjust: '调整价格', configure: '配置价格' }
      const EN = { title: 'Model usage statistics', cacheMiss: 'Uncached', heatBackfilled: '{days} days backfilled', mergedFrom: 'Served by one model; merged ids: {ids}', mergedIds: '{n} merged ids', versionHint: 'Version of the plugin currently running', heatEmpty: 'Accumulating from this version — fills in as you work', heatTitle: 'Activity heatmap', heatLess: 'Less', heatMore: 'More', heatActiveDays: '{days} active days', heatTotal: 'total {value}', latest: 'latest', byTools: 'Tools', effToolCalls: 'Tool calls', effFailRate: 'Failure rate', effPerCall: 'Cost / call', effTokensPerCall: 'Tokens / call', effTopTools: 'Top tools', tabOverview: 'Overview', tabModels: 'Models', tabConfig: 'Settings', openModels: 'Open full model list', advanced: 'Settings', shareTitle: 'Where the money goes', expandHint: 'Click for token details and pricing', totalCost: 'Period cost', shareCost: 'Where the money goes (by cost)', shareTokens: 'Usage share (by tokens)', advanced: 'Rates, balance and pricing', andMore: '{n} more models not shown', cacheHitValue: 'Cache hit {pct}%', cacheHitShort: 'hit {pct}%', cacheHintNone: 'Cache hit —', callsShort: '{calls} calls', failedShort: '{failed} failed', noUsage: 'Not called yet', trendTitle: 'Usage trend',trendEmpty: 'No time-series data yet. The ledger starts recording from this version; send a few messages and the trend appears here.',byDay: 'Daily',byHour: 'Hourly',byTokens: 'Tokens',byCost: 'Cost',axisMax: 'peak {value}',other: 'Other',cacheHit: 'Cache hit',composeTitle: 'Token share by model', totalTokens:'Total tokens', balance: 'Account balance', loading: 'Loading model usage data…', retrying: 'Retrying automatically…', loadFailed: 'Load failed: {error}', targetCurrency: 'Target currency', rate: 'USD→{target} rate {rate}', updatedAt: 'Updated {time}', live: 'Live', defaultRate: 'Default', cacheHint: 'Cached for 7 days; refresh manually', refreshRates: 'Refresh rates', refreshing: 'Refreshing…', queryBalance: 'Query balance', querying: 'Querying…', balanceConfig: 'Balance settings', collapseBalanceConfig: 'Hide balance settings', onlyUsed: 'Show used models only', balanceKey: 'API key (leave blank to use DEEPSEEK_API_KEY)', balanceBaseUrl: 'Balance API base URL', saveAndQuery: 'Save and query', error: 'Error: {error}', calls: 'Calls', tokens: 'Tokens', cost: 'Cost ({target})', failed: 'Failed', callMeta: '{calls} calls', failedMeta: ' · {failed} failed', costMeta: ' · Cost {cost} {target}', notConfigured: ' (price not configured)', unused: 'Not called yet', peakTokens: 'Peak tokens: input {input} · output {output} · cache read {read} · cache write {write}', pricingCurrency: 'Pricing currency', input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write', peakPricing: 'Peak/off-peak pricing (peak rates apply during peak hours)', secondPeak: 'Enable second peak period', peakPeriod: 'Peak period {n}', timeHint: 'HH:MM · interpreted in the selected time zone (DeepSeek peak windows are UTC) · overnight ranges e.g. 22:00–06:00', weekdaysOnly: 'Weekdays only', peakInput: 'Peak input', peakOutput: 'Peak output', peakCacheRead: 'Peak cache read', peakCacheWrite: 'Peak cache write', sharedPeak: 'Both peak periods use the same peak rates; blank peak rates use normal rates', normalPeak: 'Blank peak rates use normal rates', saving: 'Saving…', save: 'Save', reset: 'Reset', remove: 'Remove', unit: 'Unit price: {currency} / million tokens · displayed in target currency', adjust: 'Adjust price', configure: 'Configure price', modelPlaceholder: 'Model ID, e.g. deepseek-chat (preset price)', add: 'Add', emptyUsed: 'No model usage yet; send a message to collect usage (uncheck “Show used models only” to view prices)', empty: 'No models; add one using the field below', balanceLoading: 'Querying…', balanceError: 'Query failed', balanceNone: 'Not queried', balanceUpdated: 'Balance updated {time}', balanceQuerying: 'Querying account balance…', balanceHint: 'Click “Query balance” to fetch', errorPrefix: 'Error: {error}', emptyUsed: 'No model calls yet; send a message to collect usage (clear “Show used models only” to view price configuration)', empty: 'No models; add one below', modelPlaceholder: 'Model ID, e.g. deepseek-chat (preset price)', add: 'Add', sharedPeak: 'Both peak periods use the same peak rates; blank peak rates use normal rates', normalPeak: 'Blank peak rates use normal rates', save: 'Save', saving: 'Saving…', reset: 'Reset', remove: 'Remove', unit: 'Unit price: {currency} / million tokens · displayed in target currency', adjust: 'Adjust price', configure: 'Configure price' }
      const interpolate = (value, params) => String(value).replace(/\{(\w+)\}/g, (_, key) => params && params[key] !== undefined ? params[key] : '{' + key + '}')
      const fallbackT = (key, params) => interpolate(EN[key] || key, params)

      const getStats = () => fetch(API, { cache: 'no-store' }).then((res) => res.json())
      const postAction = (body) => fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((res) => res.json())

      return {
        inject: ['slots', 'locale'],
        apply(ctx) {
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
            /* 按钮对齐 shell 的 ui-primitives Button（.sm 胶囊 + .outline 描边）：
               几何与交互态都取它的口径，否则在设置面板里会像另一套控件。 */
            .mu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px;
              height: 28px; padding: 0 10px; border-radius: 14px;
              font: inherit; font-size: 12px; line-height: 18px;
              border: 0.5px solid var(--dsw-alias-border-l3); background: transparent;
              color: var(--dsw-alias-label-primary); cursor: pointer; }
            .mu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
            .mu-btn:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
            .mu-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
            .mu-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            .mu-cur { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-cur-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
            .mu-select { box-sizing: border-box; height: 28px; padding: 0 6px; cursor: pointer;
              border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 8px;
              font: inherit; font-size: 12px; line-height: 18px;
              background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
            .mu-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
            .mu-rate { font-size: 11px; color: var(--dsw-alias-label-secondary); }
            .mu-version { font-size: 10px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
            /* 汇率来源徽标：前景色走主题令牌（写死 #fff 在深色主题下会与底色撞车）。 */
            .mu-badge-live, .mu-badge-default { font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 6px; color: var(--dsw-alias-label-primary-foreground); }
            .mu-badge-live { background: var(--dsw-alias-state-success-primary); }
            .mu-badge-default { background: var(--dsw-alias-state-warn-primary); }

            .mu-list { display: flex; flex-direction: column; gap: 6px; }
            .mu-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); padding: 8px 10px; }
            .mu-card-head { display: flex; align-items: baseline; gap: 8px; }
            .mu-card-head-clickable { cursor: pointer; }
            .mu-model { font-weight: 600; font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-provider { font-size: 11px; color: var(--dsw-alias-label-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-price-toggle { align-self: flex-start; margin-top: 10px; font: inherit; font-size: 12px;
              color: var(--dsw-alias-brand-primary); background: transparent; border: none;
              padding: 4px 8px; border-radius: 8px; cursor: pointer; }
            .mu-price-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
            .mu-price-toggle:active { background: var(--dsw-alias-interactive-bg-active); }
            .mu-price { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
            .mu-price-cur { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
            .mu-price-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
            .mu-field-label { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-bottom: 3px; }
            .mu-input { box-sizing: border-box; width: 100%; height: 28px; padding: 0 10px;
              border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 8px;
              font: inherit; font-size: 12px; line-height: 18px;
              background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
            .mu-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
            .mu-input::placeholder { color: var(--dsw-alias-label-dimmed); }
            .mu-price-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
            .mu-peak { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
            .mu-peak-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-primary); cursor: pointer; }
            .mu-peak-body { margin-top: 8px; }
            .mu-peak-window { margin-bottom: 6px; }
            .mu-peak-time { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
            .mu-peak-stats { margin-top: 6px; font-size: 11px; color: var(--dsw-alias-state-warn-primary); }
            .mu-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); font-weight: 400; }
            .mu-error { color: var(--dsw-alias-state-error-primary); margin-bottom: 10px; }
            .mu-empty { color: var(--dsw-alias-label-secondary); padding: 14px 0; text-align: center; }
            .mu-add { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
            .mu-big { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
            .mu-big-card { flex: 1; min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); padding: 8px 12px; }
            .mu-big-value { font-size: 19px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-big-label { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
            .mu-big-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
            .mu-big-value.err { color: var(--dsw-alias-state-error-primary); font-size: 18px; }
            .mu-big-value.wait { color: var(--dsw-alias-label-secondary); font-size: 18px; }
            .mu-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; margin-left: auto; }
            .mu-bconf { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-bconf-label { font-size: 11px; color: var(--dsw-alias-label-secondary); }
            /* ---- 图表 ---- */
            .mu-chart-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); padding: 7px 11px; margin-bottom: 6px; }
            .mu-chart-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
            .mu-chart-title { font-size: 13px; font-weight: 600; margin-right: auto; }
            .mu-chart-switch { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
            .mu-chart-sep { width: 1px; height: 14px; background: var(--dsw-alias-border-l2); margin: 0 4px; }
            .mu-btn-on { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-foreground); }
            .mu-btn-on:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
            .mu-chart-body { position: relative; }
            /* 柱靠左排列的定宽块：不用 flex:1 均分整行，点少时不会被拉得满屏都是。 */
            .mu-chart-bars { display: flex; align-items: flex-end; justify-content: flex-start; gap: 2px; height: 64px; padding-bottom: 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
            .mu-chart-col { flex: 0 0 auto; width: var(--mu-bar-w, 12px); display: flex; align-items: flex-end; justify-content: center; height: 100%; cursor: default; }
            .mu-chart-col-on { background: var(--dsw-alias-bg-layer-2); border-radius: 3px; }
            /* 高度是百分比，参照 .mu-chart-col 的 100% 高度（即柱区高度）。
               min-height 保证占比极小的柱子仍可见，而不需要 JS 传像素值。 */
            .mu-chart-stack { width: 100%; max-width: 22px; min-height: 2px; display: flex; flex-direction: column; justify-content: flex-end; border-radius: 2px 2px 0 0; overflow: hidden; }
            .mu-chart-seg { display: block; width: 100%; }
            .mu-chart-axis { display: flex; align-items: center; justify-content: flex-start; gap: 10px; font-size: 10px; color: var(--dsw-alias-label-tertiary); margin-top: 4px; }
            .mu-chart-axis-max { margin-left: auto; }
            .mu-chart-axis-max { color: var(--dsw-alias-label-quaternary); }
            .mu-chart-info { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 10px; min-height: 18px; margin-bottom: 4px; font-size: 11px; }
            .mu-chart-info-date { color: var(--dsw-alias-label-secondary); white-space: nowrap; }
            .mu-chart-info-total { color: var(--dsw-alias-label-primary); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
            .mu-chart-info-part { display: inline-flex; align-items: baseline; gap: 4px; color: var(--dsw-alias-label-tertiary); }
            .mu-chart-info-part b { color: var(--dsw-alias-label-secondary); font-weight: 500; font-variant-numeric: tabular-nums; }
            /* 悬停浮窗：与 shell 的 ui-primitives/Tooltip 同一口径——深色气泡、
               固定浅色前景、position: fixed（因此**允许**越出图表，这是气泡的正常行为；
               不许越出的是柱子，见 .mu-chart-bars 的定宽靠左块）。 */
            .mu-chart-tip { position: fixed; z-index: 100; width: max-content;
              max-width: min(280px, 60vw); padding: 6px 9px;
              border-radius: 8px; background: var(--dsw-alias-tooltip-bg);
              color: var(--dsw-static-neutral-bluish-00);
              font-size: 11px; line-height: 17px;
              pointer-events: none; animation: mu-tip-in 150ms var(--ds-ease-in-out, ease-in-out); }
            @keyframes mu-tip-in { from { opacity: 0; } }
            @media (prefers-reduced-motion: reduce) { .mu-chart-tip { animation: none; } }
            .mu-chart-tip-head { display: flex; align-items: baseline; gap: 10px;
              color: var(--dsw-static-neutral-bluish-300); margin-bottom: 3px; }
            .mu-chart-tip-total { margin-left: auto; font-weight: 600;
              color: var(--dsw-static-neutral-bluish-00); font-variant-numeric: tabular-nums; }
            .mu-chart-tip-meta { color: var(--dsw-static-neutral-bluish-400); margin-bottom: 3px; }
            .mu-chart-tip-row { display: flex; align-items: baseline; gap: 6px; }
            .mu-chart-tip-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
              white-space: nowrap; color: var(--dsw-static-neutral-bluish-300); }
            .mu-chart-tip-value { color: var(--dsw-static-neutral-bluish-00); font-variant-numeric: tabular-nums; }
            .mu-legend { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 6px; }
            .mu-legend-row { display: flex; align-items: center; gap: 5px; font-size: 11px; max-width: 220px; }
            .mu-legend-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
            .mu-legend-name { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-legend-value { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; margin-left: auto; }
            .mu-stack { display: flex; width: 100%; height: 4px; border-radius: 2px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); margin-top: 5px; }
            .mu-stack-empty { background: var(--dsw-alias-bg-layer-2); }
            .mu-stack-seg { display: block; height: 100%; }
            /* 花费去向：横向条，谁贵谁长 */
            .mu-share-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
            .mu-share-bar { display: block; height: 100%; border-radius: 3px; }
                                    /* 次要计数：一行小字 */
            .mu-subline { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin: 0 0 12px; }
            /* 效率卡：把"花了多少"推进到"花得值不值" */
            /* GitHub 风格热力图：53 周 × 7 天。强度色由 brand-primary 混合主题底色派生，
               因此深浅主题都跟随，不写死色值。 */
            .mu-heat-card { padding: 7px 11px; margin-bottom: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-heat-body { position: relative; }
            .mu-heat-months { display: flex; gap: 2px; margin-bottom: 2px; height: 10px; }
            .mu-heat-month { width: var(--mu-heat-cell, 9px); flex: 0 0 auto; font-size: 9px; line-height: 10px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
            .mu-heat-grid { display: flex; gap: 2px; }
            .mu-heat-col { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
            .mu-heat-cell { display: block; width: var(--mu-heat-cell, 9px); height: var(--mu-heat-cell, 9px); border-radius: 2px; background: var(--dsw-alias-bg-layer-2); }
            .mu-heat-l1 { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, var(--dsw-alias-bg-layer-1)); }
            .mu-heat-l2 { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-bg-layer-1)); }
            .mu-heat-l3 { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-bg-layer-1)); }
            .mu-heat-l4 { background: var(--dsw-alias-brand-primary); }
            .mu-heat-lx { background: transparent; }
            .mu-heat-stat { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
            .mu-heat-legend { display: inline-flex; align-items: center; gap: 4px; }
            .mu-heat-legend .mu-heat-cell { width: 9px; height: 9px; }

            /* 占比卡：谁的钱 / 谁的量占多少 */
            .mu-share-card { padding: 7px 11px; margin-bottom: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-share-row { display: grid; grid-template-columns: minmax(88px, 1.1fr) 2fr auto auto; align-items: center; gap: 8px; font-size: 11px; line-height: 1.75; }
            .mu-share-name { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-share-merged { color: var(--dsw-alias-label-quaternary); }
            .mu-share-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
            .mu-share-bar { display: block; height: 100%; border-radius: 3px; }
            .mu-share-value { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
            .mu-share-pct { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; min-width: 38px; text-align: right; }
            .mu-eff { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 14px; padding: 6px 11px; margin-bottom: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
            .mu-eff-metrics { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 14px; }
            .mu-eff-item { display: inline-flex; align-items: baseline; gap: 4px; }
            .mu-eff-value { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
            .mu-eff-warn { color: var(--dsw-alias-state-warn-primary); }
            .mu-eff-label { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
            .mu-eff-tools { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin-left: auto; }
            .mu-eff-tool { display: inline-flex; align-items: baseline; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); padding: 1px 6px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); }
            .mu-eff-tool-count { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
            /* 模型卡片：费用主位 + 单行 token 明细 */
            .mu-card-figure { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; flex: none; }
            .mu-cost { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); white-space: nowrap; }
            .mu-cost-none { font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
            .mu-cost-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
            .mu-cost-share { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-left: 5px; font-variant-numeric: tabular-nums; }
            .mu-share-track-sm { margin-top: 5px; height: 3px; }
            .mu-token-line { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 6px; font-size: 11px; }
            .mu-token-item { display: flex; align-items: center; gap: 5px; }
            .mu-token-label { color: var(--dsw-alias-label-tertiary); }
            .mu-token-value { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
            /* 合并说明：一个服务模型背后的历史 id 明细（只在展开时显示） */
            .mu-merge-list { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--dsw-alias-border-l1); }
            .mu-merge-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 11px; line-height: 18px; }
            .mu-merge-id { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mu-merge-meta { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; flex: none; }
            /* 子页面切换：主页只放宏观统计，明细与配置各自成页 */
            .mu-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); margin-bottom: 10px; }
            .mu-tab { appearance: none; border: none; background: transparent; font: inherit; cursor: pointer;
              padding: 6px 10px; font-size: 12px; line-height: 18px; border-radius: 8px 8px 0 0;
              color: var(--dsw-alias-label-secondary); border-bottom: 2px solid transparent; margin-bottom: -1px; }
            .mu-tab:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
            .mu-tab:active { background: var(--dsw-alias-interactive-bg-active); }
            .mu-tab-on { color: var(--dsw-alias-brand-primary); border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 600; }
            .mu-pane { display: block; }
            .mu-more { display: block; width: 100%; margin-top: 6px; padding: 6px 0; font: inherit; font-size: 12px;
              color: var(--dsw-alias-brand-primary); background: transparent; border: none; border-radius: 8px; cursor: pointer; }
            .mu-more:hover { background: var(--dsw-alias-interactive-bg-hover); }
            .mu-more:active { background: var(--dsw-alias-interactive-bg-active); }
            .mu-toggle-lead { margin: 0 0 8px; }
          `
          document.head.appendChild(styleEl)
          ctx.on('dispose', () => {
            if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl)
          })

          const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD', 'CAD']
          const fmt = (n) => Number(n || 0).toLocaleString()
          // 费用格式化：按量级决定小数位。费用天然有小额项（缓存命中单价 ¥0.02/百万），
          // 一律 6 位会让主数字变成 "340.992536" 这种读不出来也占宽度的东西；
          // 一律 2 位又会把小额项显示成 0。分档后兼顾可读性与不丢信息。
          const fmtMoney = (n) => {
            if (!Number.isFinite(n)) return '-'
            if (n === 0) return '0'
            const abs = Math.abs(n)
            const digits = abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
            return n.toFixed(digits).replace(/\.?0+$/, '')
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

          // 价格表的唯一真源在 Host（src/index.js 的 PRESET_PRICES），随快照的
          // `presets` 字段下发。历史上这里复制过一份 49 条的表，两边必须手工保持
          // 一致；删掉副本后"重置"按钮与 Host 的计费口径不可能再漂移。
          //
          // 归一化规则必须与 Host 的 normalizeModelId 等价：v4.1 只对当前价格的
          // 已知旧 id 做别名折叠（如 deepseek-v4-flash -> deepseek-flash），
          // 泛化的日期后缀剥离交给 Host 返回的 modelKey。
          const CLIENT_ALIASES = {
            'deepseek-v4-flash': 'deepseek-flash',
            'deepseek-v4-flash-0731': 'deepseek-flash',
            'deepseek-v4-flash-vision-exp': 'deepseek-flash',
            'deepseek-flash-vision-exp': 'deepseek-flash',
            'deepseek-v4-pro': 'deepseek-flash',
            'deepseek-v4-pro-0813': 'deepseek-flash',
            'deepseek-v4.1-flash': 'deepseek-flash',
          }
          const normalizeModelId = (model) => CLIENT_ALIASES[String(model || '')] || String(model || '')

          const presetFor = (presets, model, row) => {
            const catalog = presets || {}
            if (!catalog || typeof catalog !== 'object') return undefined
            const direct = catalog[String(model || '')]
            if (direct) return direct
            if (row && row.modelKey && catalog[row.modelKey]) return catalog[row.modelKey]
            return catalog[normalizeModelId(model)]
          }

          // ---------- 图表基础 ----------
          //
          // 纯 SVG，不引入任何图表库：面板是设置页里的一小块，多一个运行时依赖
          // 不划算。配色全部从 harness 设计令牌派生，深色主题自动跟随；超过 5 个
          // 系列时用 color-mix 在同族色上做深浅区分，避免硬编码 hex。
          const CHART_COLORS = [
            'var(--dsw-alias-brand-primary)',
            'var(--dsw-alias-state-success-primary)',
            'var(--dsw-alias-state-warn-primary)',
            'var(--dsw-alias-state-business-primary)',
            'var(--dsw-alias-state-error-primary)',
            'var(--dsw-alias-brand-text)',
          ]
          /**
           * 取第 index 个系列色；超出主色板时用同族色做深浅偏移。
           * @param {number} index - 系列序号。
           * @returns {string} CSS 颜色值。
           */
          const seriesColor = (index) => {
            const base = CHART_COLORS[index % CHART_COLORS.length]
            const round = Math.floor(index / CHART_COLORS.length)
            if (round === 0) return base
            const mix = Math.min(70, 22 + round * 18)
            return 'color-mix(in srgb, ' + base + ' ' + (100 - mix) + '%, var(--dsw-alias-bg-base))'
          }
          // token 构成固定四档：未命中输入 / 缓存命中 / 缓存写入 / 输出。
          const TOKEN_COLORS = {
            input: 'var(--dsw-alias-brand-primary)',
            cacheRead: 'var(--dsw-alias-state-success-primary)',
            cacheWrite: 'var(--dsw-alias-state-business-primary)',
            output: 'var(--dsw-alias-state-warn-primary)',
          }
          /** 横向堆叠条：token 构成或单模型占比。 */
          function StackBar(props) {
            let total = 0
            for (const part of props.parts) total += Number(part.value) || 0
            if (total <= 0) return React.createElement('div', { className: 'mu-stack mu-stack-empty' })
            return React.createElement('div', { className: 'mu-stack' },
              props.parts.filter((part) => Number(part.value) > 0).map((part) => React.createElement('span', {
                key: part.key,
                className: 'mu-stack-seg',
                style: { width: (Number(part.value) / total * 100) + '%', background: part.color },
                title: part.title || part.key,
              })))
          }
          /** 图例：色块 + 名称 + 数值，供环形图与堆叠条共用。 */
          const legend = (items) => React.createElement('div', { className: 'mu-legend' },
            items.map((item) => React.createElement('div', { className: 'mu-legend-row', key: item.key },
              React.createElement('span', { className: 'mu-legend-dot', style: { background: item.color } }),
              React.createElement('span', { className: 'mu-legend-name', title: item.label }, item.label),
              React.createElement('span', { className: 'mu-legend-value' }, item.valueText))))

          // GitHub 风格的贡献格子：53 周 × 7 天 = 371 个格子，当天用得越多颜色越深。
          const HEAT_WEEKS = 53
          const HEAT_LEVELS = 4
          const HEAT_CELL_MIN = 4
          const HEAT_CELL_MAX = 11
          const HEAT_GAP = 2

          /**
           * 热力图卡：一年跨度的每日强度格子。
           *
           * 只吃 host 的紧凑日账（每天一个标量），因此可以覆盖 53 周而不撑大 payload。
           * 强度按"相对当期峰值"分四档，而不是分位数——分位数在数据稀疏时会给出
           * 反直觉的深色格子（只有一天有数据也能染成最深）。
           */
          function HeatmapCard(props) {
            const t = props.t
            const series = props.series || []
            const [metric, setMetric] = React.useState('tokens')
            const [tip, setTip] = React.useState(null)
            const bodyRef = React.useRef(null)
            const width = useChartWidth(bodyRef)

            const byDate = new Map()
            let max = 0
            for (const entry of series) {
              const value = metric === 'tokens' ? (entry.t || 0) : (entry.k || 0)
              byDate.set(entry.d, value)
              if (value > max) max = value
            }
            const levelOf = (value) => {
              if (!(value > 0) || max <= 0) return 0
              const ratio = value / max
              if (ratio <= 0.25) return 1
              if (ratio <= 0.5) return 2
              if (ratio <= 0.75) return 3
              return HEAT_LEVELS
            }

            // 网格：起点回退到"今天往前 53 周"那一周之前的周日，列数按需取，
            // 保证**末列包含今天**。
            //
            // 曾经固定 53 列：把起点回退到周日后整个窗口跟着前移，末格变成
            // "今天 − 今天星期几"，于是最近若干天的记录永远落在网格之外——
            // 表现就是"热力图一片空白，看起来没渲染"。
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const rawStart = new Date(today)
            rawStart.setDate(rawStart.getDate() - (HEAT_WEEKS * 7 - 1))
            const start = new Date(rawStart)
            start.setDate(start.getDate() - start.getDay())
            const coveredDays = Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1
            const weekCount = Math.ceil(coveredDays / 7)
            const cell = Math.max(HEAT_CELL_MIN, Math.min(HEAT_CELL_MAX,
              Math.floor((width - (weekCount - 1) * HEAT_GAP) / weekCount)))
            const weeks = []
            const monthLabels = []
            let cursor = new Date(start)
            for (let week = 0; week < weekCount; week += 1) {
              const days = []
              let label = null
              for (let day = 0; day < 7; day += 1) {
                const key = localDayKey(cursor)
                const future = cursor > today
                const value = future ? null : (byDate.get(key) || 0)
                // 月份标签落在"这一周里出现了 1 号"的列上。
                if (cursor.getDate() === 1) label = cursor.getMonth() + 1
                days.push({ key, value, future })
                cursor.setDate(cursor.getDate() + 1)
              }
              weeks.push({ days, label })
              monthLabels.push(label)
            }
            // 相邻标签太近就丢掉，避免月份文字重叠。
            let lastLabelWeek = -4
            const shownLabels = monthLabels.map((month, index) => {
              if (month === null) return null
              if (index - lastLabelWeek < 4) return null
              lastLabelWeek = index
              return month
            })

            const total = series.reduce((sum, entry) => sum + (metric === 'tokens' ? (entry.t || 0) : (entry.k || 0)), 0)
            const activeDays = series.filter((entry) => (metric === 'tokens' ? entry.t : entry.k) > 0).length

            return React.createElement('div', { className: 'mu-heat-card' },
              React.createElement('div', { className: 'mu-chart-head' },
                React.createElement('span', { className: 'mu-chart-title' }, t('heatTitle')),
                // 图例与统计并进头部：热力图本身不高，多一行页脚反而喧宾夺主。
                React.createElement('span', { className: 'mu-heat-legend' },
                  React.createElement('span', null, t('heatLess')),
                  [0, 1, 2, 3, HEAT_LEVELS].map((level) => React.createElement('span', {
                    key: level,
                    className: 'mu-heat-cell mu-heat-l' + level,
                  })),
                  React.createElement('span', null, t('heatMore'))),
                React.createElement('span', { className: 'mu-heat-stat' },
                  max > 0
                    ? t('heatActiveDays', { days: activeDays }) + ' · ' + t('heatTotal', { value: fmt(total) })
                      + (props.backfilledDays > 0 ? ' · ' + t('heatBackfilled', { days: props.backfilledDays }) : '')
                    : t('heatEmpty')),
                React.createElement('div', { className: 'mu-chart-switch' },
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'tokens' ? ' mu-btn-on' : ''),
                    onClick: () => { setMetric('tokens'); setTip(null) },
                  }, t('byTokens')),
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'tools' ? ' mu-btn-on' : ''),
                    onClick: () => { setMetric('tools'); setTip(null) },
                  }, t('byTools')))),
              React.createElement('div', { className: 'mu-heat-body', ref: bodyRef, onMouseLeave: () => setTip(null) },
                React.createElement('div', { className: 'mu-heat-months', style: { '--mu-heat-cell': cell + 'px' } },
                  shownLabels.map((month, index) => React.createElement('span', { key: index, className: 'mu-heat-month' }, month === null ? '' : month + '月'))),
                React.createElement('div', { className: 'mu-heat-grid', style: { '--mu-heat-cell': cell + 'px' } },
                  weeks.map((week, weekIndex) => React.createElement('div', { className: 'mu-heat-col', key: weekIndex },
                    week.days.map((entry) => React.createElement('span', {
                      key: entry.key,
                      className: 'mu-heat-cell mu-heat-l' + (entry.future ? 'x' : levelOf(entry.value)),
                      title: entry.future ? undefined : entry.key,
                      onMouseEnter: entry.future ? undefined : (event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        setTip({
                          anchor: { centerX: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom },
                          day: entry.key,
                          value: entry.value,
                        })
                      },
                    }))))),
                tip !== null
                  ? React.createElement('div', { className: 'mu-chart-tip', style: tipStyleFor(tip.anchor, 220) },
                      React.createElement('div', { className: 'mu-chart-tip-head' },
                        React.createElement('span', null, tip.day),
                        React.createElement('span', { className: 'mu-chart-tip-total' },
                          metric === 'tokens' ? fmt(tip.value) + ' ' + t('tokens') : fmt(tip.value) + ' ' + t('byTools'))))
                  : null),
              )
          }

          /**
           * 占比卡：钱与量各花在哪个模型上。
           *
           * 理念与 shell / dsh-context 一致——**占比是"整体的一部分"，计数不是**。
           * 所以首页只放这种"占整体的多少"的条形，而不是把明细页的模型卡片再抄一遍。
           * 横向条而非环形图：一家独大时环形图会退化成一个整圆。
           */
          function ShareCard(props) {
            const t = props.t
            const entries = props.entries || []
            const metric = props.metric
            let total = 0
            for (const entry of entries) total += entry.value
            if (entries.length === 0 || total <= 0) return null
            // 恒定 4 行：超出就取前 3 名 + "其他"，这样行数不随模型数变化，
            // 首页高度才是真正恒定的（而不是"有界"）。4 行已足够看清集中度。
            const topCount = entries.length > 4 ? 3 : 4
            const top = entries.slice(0, topCount)
            const restValue = entries.slice(topCount).reduce((sum, entry) => sum + entry.value, 0)
            const rows = top.map((entry, index) => ({ ...entry, color: seriesColor(index) }))
            if (restValue > 0) rows.push({ model: '__rest', value: restValue, color: 'var(--dsw-alias-label-quaternary)' })
            return React.createElement('div', { className: 'mu-share-card' },
              React.createElement('div', { className: 'mu-chart-head' },
                React.createElement('span', { className: 'mu-chart-title' }, t('shareTitle')),
                React.createElement('div', { className: 'mu-chart-switch' },
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'cost' ? ' mu-btn-on' : ''),
                    onClick: () => props.onMetric('cost'),
                  }, t('byCost')),
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'tokens' ? ' mu-btn-on' : ''),
                    onClick: () => props.onMetric('tokens'),
                  }, t('byTokens')))),
              rows.map((entry) => {
                const share = Math.round(entry.value / total * 1000) / 10
                return React.createElement('div', { className: 'mu-share-row', key: entry.model },
                  React.createElement('span', {
                    className: 'mu-share-name',
                    // 合并桶必须自证：只写 deepseek-flash 会让人以为那是单个 id 的用量。
                    title: entry.members && entry.members.length > 1
                      ? t('mergedFrom', { ids: entry.members.join(', ') })
                      : entry.model,
                  },
                    entry.model === '__rest' ? t('other') : entry.model,
                    entry.members && entry.members.length > 1
                      ? React.createElement('span', { className: 'mu-share-merged' }, ' +' + (entry.members.length - 1))
                      : null),
                  React.createElement('span', { className: 'mu-share-track' },
                    React.createElement('span', { className: 'mu-share-bar', style: { width: Math.max(share, 1.5) + '%', background: entry.color } })),
                  React.createElement('span', { className: 'mu-share-value' }, props.formatValue(entry.value, metric)),
                  React.createElement('span', { className: 'mu-share-pct' }, share + '%'))
              }))
          }

          /**
           * 效率卡：把"花了多少"推进到"花得值不值"。
           *
           * 四个数各自回答一个问题——工具调用数（这轮 agentic 强度）、失败率（工具不稳
           * 还是模型不会用）、每调用均价（哪个模型真的划算）、最高频工具（谁在烧钱）。
           * 没有工具活动时整张卡不渲染，不留空壳。
           */
          function EfficiencyCard(props) {
            const t = props.t
            const stats = props.stats
            if (!stats || stats.toolCalls <= 0) return null
            const failPct = stats.toolCalls > 0 ? Math.round(stats.toolFailed / stats.toolCalls * 1000) / 10 : 0
            const perCall = stats.calls > 0 ? stats.totalCost / stats.calls : null
            const tools = props.topTools.slice(0, 4)
            return React.createElement('div', { className: 'mu-eff' },
              React.createElement('div', { className: 'mu-eff-metrics' },
                React.createElement('span', { className: 'mu-eff-item' },
                  React.createElement('span', { className: 'mu-eff-value' }, fmt(stats.toolCalls)),
                  React.createElement('span', { className: 'mu-eff-label' }, t('effToolCalls'))),
                React.createElement('span', { className: 'mu-eff-item' },
                  React.createElement('span', { className: failPct > 5 ? 'mu-eff-value mu-eff-warn' : 'mu-eff-value' }, failPct + '%'),
                  React.createElement('span', { className: 'mu-eff-label' }, t('effFailRate'))),
                React.createElement('span', { className: 'mu-eff-item' },
                  React.createElement('span', { className: 'mu-eff-value' }, perCall === null ? '—' : fmtMoney(perCall) + ' ' + props.target),
                  React.createElement('span', { className: 'mu-eff-label' }, t('effPerCall'))),
                React.createElement('span', { className: 'mu-eff-item' },
                  React.createElement('span', { className: 'mu-eff-value' }, stats.tokensPerCall === null ? '—' : fmt(stats.tokensPerCall)),
                  React.createElement('span', { className: 'mu-eff-label' }, t('effTokensPerCall')))),
              React.createElement('span', { className: 'mu-eff-tools' },
                React.createElement('span', { className: 'mu-eff-label' }, t('effTopTools')),
                tools.map((entry) => React.createElement('span', { className: 'mu-eff-tool', key: entry.name },
                  entry.name,
                  React.createElement('span', { className: 'mu-eff-tool-count' }, fmt(entry.calls))))))
          }

          /**
           * 趋势卡：按天或按小时堆叠柱。每根柱是若干模型的 token 或费用，
           * 鼠标悬停显示该时段的明细（悬停态由本组件自持，不污染页面状态）。
           */
          // 柱数上限与单柱最小宽度：柱数是硬上限（时间再长也不会更多），但窄栏里
          // 30 根会挤成 ~9px 的梳子，所以按实际可用宽度自适应减少柱数。
          const CHART_MAX_BARS = 30
          // 单柱最小宽度：低于这个值柱子就读不出形状了，此时宁可少画几根。
          const CHART_MIN_BAR_PX = 12
          const CHART_MAX_BAR_PX = 18
          const CHART_BAR_GAP_PX = 2
          // 量不到宽度时（没有 ResizeObserver）用的保守默认值：取内容区宽度再减掉
          // 卡片内边距的余量，宁可柱子略窄也不能让最后一根顶出卡片。
          // 真实浏览器一定有 ResizeObserver，这条只服务于无排版引擎的环境。
          const CHART_FALLBACK_WIDTH = 560

          /**
           * 量出图表绘图区的可用宽度（无 ResizeObserver 时退回默认值）。
           * @param {object} ref - 指向图表绘图区的 ref。
           * @returns {number} 可用宽度（px）。
           */
          function useChartWidth(ref) {
            const [width, setWidth] = React.useState(CHART_FALLBACK_WIDTH)
            React.useEffect(() => {
              const node = ref.current
              if (!node || typeof ResizeObserver !== 'function') return undefined
              const compute = () => {
                const measured = node.getBoundingClientRect().width
                if (measured > 0) setWidth(measured)
              }
              compute()
              const observer = new ResizeObserver(compute)
              observer.observe(node)
              return () => observer.disconnect()
            }, [ref])
            return width
          }

          /**
           * 浮窗的视口定位样式：水平夹取在视口内、上方空间不足就翻到锚点下方。
           * 趋势图与热力图共用，避免两份定位算法各自漂移。
           * @param {{centerX: number, top: number, bottom: number}} anchor - 锚点的视口坐标。
           * @param {number} maxWidthPx - 浮窗最大宽度，用于水平夹取。
           * @returns {object} 可直接用于 style 的对象。
           */
          function tipStyleFor(anchor, maxWidthPx) {
            const half = maxWidthPx / 2
            const viewportWidth = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024
            const left = Math.max(half + 8, Math.min(anchor.centerX, viewportWidth - half - 8))
            const below = anchor.top < 150
            return {
              left: left + 'px',
              top: (below ? anchor.bottom + 8 : anchor.top - 8) + 'px',
              transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }
          }

          /** 本地日历日 `YYYY-MM-DD`，与 host 的分桶口径一致。 */
          function localDayKey(date) {
            return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
          }

          /**
           * 由可用宽度算出柱数与柱宽。
           *
           * 柱是**靠左**排列的定宽块，不是均分整行：点少时不会把几根柱子拉得满屏都是，
           * 点多时按宽度收窄。宽度不足就减少柱数（而不是把柱子压到看不见）。
           * @param {number} width - 可用宽度（px）。
           * @returns {{ budget: number, barWidth: number }} 柱数上限与单柱宽度。
           */
          function layoutBars(width) {
            const usable = Math.max(0, width)
            const budget = Math.max(7, Math.min(CHART_MAX_BARS,
              Math.floor((usable + CHART_BAR_GAP_PX) / (CHART_MIN_BAR_PX + CHART_BAR_GAP_PX))))
            const raw = (usable - CHART_BAR_GAP_PX * (budget - 1)) / budget
            const barWidth = Math.max(CHART_MIN_BAR_PX, Math.min(CHART_MAX_BAR_PX, raw))
            return { budget, barWidth }
          }

          function TrendCard(props) {
            const t = props.t
            const series = props.series || []
            const models = props.models || []
            const metricOf = props.metricOf
            const [granularity, setGranularity] = React.useState('day')
            const [metric, setMetric] = React.useState(props.defaultMetric || 'tokens')
            const [hover, setHover] = React.useState(null)
            // 浮窗锚点：用柱子当时的视口坐标，因此浮窗可以越出图表（气泡的常态），
            // 只要留在视口内。位置在 mouseenter 时抓取，避免渲染期反复读布局。
            const [tipAnchor, setTipAnchor] = React.useState(null)
            const bodyRef = React.useRef(null)
            const chartWidth = useChartWidth(bodyRef)
            const { budget: barBudget, barWidth } = layoutBars(chartWidth)
            const points = granularity === 'day' ? (props.daySeries || []) : (props.hourSeries || [])
            // 窗口：两种粒度都取最近 barBudget 个点。日视图的数据由 host 限制在 45 天，
            // 小时视图 26 个点，因此柱数天然有上限，不会随时间变得密集。
            const windowed = points.slice(Math.max(0, points.length - barBudget))
            // 柱高用**百分比**而不是像素：曾用 `chartHeight = 132` 算 px，而 CSS 容器
            // 后来被改窄到 86px，满高的柱子就纵向溢出了 46px。百分比让两层无法漂移。
            let max = 0
            for (const point of windowed) {
              const value = metricOf(point, metric, 'total')
              if (value > max) max = value
            }
            if (max <= 0) {
              return React.createElement('div', { className: 'mu-chart-card' },
                React.createElement('div', { className: 'mu-chart-head' },
                  React.createElement('span', { className: 'mu-chart-title' }, t('trendTitle'))),
                React.createElement('div', { className: 'mu-empty' }, t('trendEmpty')))
            }
            // 只画用量前几名的模型，其余归到"其他"，否则图例会失控。
            const topModels = models.slice(0, 4)
            const colorOf = (name) => {
              const index = topModels.indexOf(name)
              return index >= 0 ? seriesColor(index) : 'var(--dsw-alias-label-quaternary)'
            }
            const bars = windowed.map((point, pointIndex) => {
              const total = metricOf(point, metric, 'total')
              // 最小可见高度由 CSS 的 min-height 兜底，这里只给真实占比。
              const height = max > 0 && total > 0 ? (total / max * 100) : 0
              const segments = []
              let stacked = 0
              for (const name of topModels) {
                const value = metricOf(point, metric, name)
                if (value <= 0) continue
                stacked += value
                segments.push({ key: name, value })
              }
              const rest = total - stacked
              if (rest > 0) segments.push({ key: '__rest', value: rest })
              return { point, pointIndex, total, height, segments }
            })
            const labelOf = (key) => {
              const date = String(key)
              if (granularity === 'hour') return date.slice(11) + ':00'
              return date.slice(5)
            }
            const hovered = hover !== null ? bars[hover] : null
            const modelLabel = (name) => (name === '__rest' ? t('other') : name)
            // 图例合计必须与图上画的是同一个窗口：先前用"全部台账"的合计去配"最近 30 天"
            // 的柱，数字与占比都会跟着错。
            const windowTotals = {}
            for (const point of windowed) {
              for (const name of topModels) {
                windowTotals[name] = (windowTotals[name] || 0) + metricOf(point, metric, name)
              }
            }
            let windowRest = 0
            const restNames = Object.keys(props.modelTotals || {}).filter((name) => !topModels.includes(name))
            for (const name of restNames) {
              for (const point of windowed) windowRest += metricOf(point, metric, name)
            }
            const legendItems = topModels.map((name, index) => ({
              key: name,
              color: seriesColor(index),
              label: name,
              valueText: props.formatValue(windowTotals[name] || 0, metric),
            }))
            if (windowRest > 0) {
              legendItems.push({ key: '__rest', color: 'var(--dsw-alias-label-quaternary)', label: t('other'), valueText: props.formatValue(windowRest, metric) })
            }
            return React.createElement('div', { className: 'mu-chart-card' },
              React.createElement('div', { className: 'mu-chart-head' },
                React.createElement('span', { className: 'mu-chart-title' }, t('trendTitle')),
                React.createElement('div', { className: 'mu-chart-switch' },
                  React.createElement('button', {
                    className: 'mu-btn' + (granularity === 'day' ? ' mu-btn-on' : ''),
                    onClick: () => { setGranularity('day'); setHover(null) },
                  }, t('byDay')),
                  React.createElement('button', {
                    className: 'mu-btn' + (granularity === 'hour' ? ' mu-btn-on' : ''),
                    onClick: () => { setGranularity('hour'); setHover(null) },
                  }, t('byHour')),
                  React.createElement('span', { className: 'mu-chart-sep' }),
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'cost' ? ' mu-btn-on' : ''),
                    onClick: () => setMetric('cost'),
                  }, t('byCost')),
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'tokens' ? ' mu-btn-on' : ''),
                    onClick: () => setMetric('tokens'),
                  }, t('byTokens')),
                  React.createElement('button', {
                    className: 'mu-btn' + (metric === 'tools' ? ' mu-btn-on' : ''),
                    onClick: () => setMetric('tools'),
                  }, t('byTools')))),
              React.createElement('div', { className: 'mu-chart-body', ref: bodyRef, onMouseLeave: () => setHover(null) },
                React.createElement('div', { className: 'mu-chart-bars', style: { '--mu-bar-w': barWidth + 'px' } },
                  bars.map((bar) => React.createElement('div', {
                    key: bar.point.date,
                    className: 'mu-chart-col' + (hover === bar.pointIndex ? ' mu-chart-col-on' : ''),
                    onMouseEnter: (event) => {
                      setHover(bar.pointIndex)
                      const rect = event.currentTarget.getBoundingClientRect()
                      setTipAnchor({
                        centerX: rect.left + rect.width / 2,
                        top: rect.top,
                        bottom: rect.bottom,
                      })
                    },
                  },
                    React.createElement('div', { className: 'mu-chart-stack', style: { height: bar.height + '%' } },
                      // 自下而上堆叠：最早进入的模型在底部，视觉顺序与图例一致。
                      bar.segments.slice().reverse().map((segment) => React.createElement('span', {
                        key: segment.key,
                        className: 'mu-chart-seg',
                        style: { height: bar.total > 0 ? (segment.value / bar.total * 100) + '%' : '0%', background: colorOf(segment.key) },
                      })))),
                  )),
                // 悬停时在绘图区内弹出浮窗（不悬停时该位置显示"最新时段"的一行摘要）。
                // 浮窗锚在绘图区左上/右上并限制 max-height，因此不会越出图表；按柱子所在
                // 半区左右翻转，避免盖住自己那一根。
                // 常驻摘要行：内容固定为"最新时段"，**不随悬停变化**——曾经悬停时把这一行
                // 换成浮窗，卡片高度就跟着变了 22px。浮窗是 fixed 定位，不占布局。
                (() => {
                  const detail = bars[bars.length - 1]
                  if (!detail) return null
                  const dateLabel = granularity === 'hour'
                    ? detail.point.date.replace('T', ' ') + ':00'
                    : detail.point.date
                  const parts = detail.segments.slice().sort((a, b) => b.value - a.value).slice(0, 4)
                  return React.createElement('div', { className: 'mu-chart-info' },
                    React.createElement('span', { className: 'mu-chart-info-date' },
                      dateLabel + ' · ' + t('latest')),
                    React.createElement('span', { className: 'mu-chart-info-total' },
                      props.formatValue(detail.total, metric)),
                    // 只给色点 + 数值，模型名交给下方图例——把名字也塞进来会让这一行
                    // 在窄栏放不下（曾经因此横向溢出）。
                    ...parts.map((segment) => React.createElement('span', { className: 'mu-chart-info-part', key: segment.key, title: modelLabel(segment.key) },
                      React.createElement('span', { className: 'mu-legend-dot', style: { background: colorOf(segment.key) } }),
                      React.createElement('b', null, props.formatValue(segment.value, metric)))))
                })()),
              // 浮窗在卡片之外渲染（fixed 定位，不参与布局），因此不会被图表的任何
              // 边界约束——越出图表是气泡的正常行为，只需留在视口内。
              (() => {
                if (hovered === null || tipAnchor === null) return null
                const style = tipStyleFor(tipAnchor, 280)
                const detail = hovered
                const dateLabel = granularity === 'hour'
                  ? detail.point.date.replace('T', ' ') + ':00'
                  : detail.point.date
                const parts = detail.segments.slice().sort((a, b) => b.value - a.value).slice(0, 4)
                return React.createElement('div', { className: 'mu-chart-tip', style },
                  React.createElement('div', { className: 'mu-chart-tip-head' },
                    React.createElement('span', null, dateLabel),
                    React.createElement('span', { className: 'mu-chart-tip-total' }, props.formatValue(detail.total, metric))),
                  React.createElement('div', { className: 'mu-chart-tip-meta' },
                    t('callsShort', { calls: fmt(detail.point.calls || 0) })
                    + (detail.point.failed ? t('failedMeta', { failed: detail.point.failed }) : '')
                    + (metric === 'tools' ? '' : ' · ' + t('byTools') + ' ' + fmt(detail.toolCalls || 0))),
                  parts.map((segment) => React.createElement('div', { className: 'mu-chart-tip-row', key: segment.key },
                    React.createElement('span', { className: 'mu-legend-dot', style: { background: colorOf(segment.key) } }),
                    React.createElement('span', { className: 'mu-chart-tip-name' }, modelLabel(segment.key)),
                    React.createElement('span', { className: 'mu-chart-tip-value' }, props.formatValue(segment.value, metric)))))
              })(),
              React.createElement('div', { className: 'mu-chart-axis' },
                React.createElement('span', null, windowed.length ? labelOf(windowed[0].date) : ''),
                React.createElement('span', { className: 'mu-chart-axis-max' }, t('axisMax', { value: props.formatValue(max, metric) })),
                React.createElement('span', null, windowed.length ? labelOf(windowed[windowed.length - 1].date) : '')),
              legend(legendItems))
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
            // 子页面：总览只放宏观图表，明细与配置各自成页，主页高度因此不随模型数增长。
            const [tab, setTab] = React.useState('overview')
            // 占比卡的展示口径。Hooks 必须全部声明在 `view === null` 早退之前。
            const [shareMetric, setShareMetric] = React.useState('cost')
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
              // 轮询间隔：设置页不是实时看板，10 秒足够；隐藏标签页时不请求。
              const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 10000)
              return () => window.clearInterval(timer)
            }, [refresh])

            if (view === null) {
              return React.createElement('div', { className: 'mu-page' },
                React.createElement('div', { className: 'mu-error' }, error ? t('loadFailed', { error }) : ''),
                React.createElement('div', null, error ? t('retrying') : t('loading')))
            }

            const rows = view.rows || []
            const priceMap = view.prices || {}
            const presetMap = view.presets || {}
            const rates = view.rates || {}
            const target = view.targetCurrency || 'CNY'
            const rateOf = (code) => {
              const v = Number(rates[code])
              return Number.isFinite(v) && v > 0 ? v : 1
            }
            const rowOf = (model) => rows.find((r) => r.model === model)
            // 同一模型可能有多个历史 id（如 deepseek-v4-flash → deepseek-flash，退役后由
            // 新模型同价继续服务）。首页"花费去向"已经按服务模型合并，详情页若按原始 id
            // 分行，两处数字就对不上，读者会以为统计错了。这里把明细也按服务模型分组：
            // 计数相加，成员 id 保留下来在展开区列出。
            const MERGED_FIELDS = [
              'calls', 'failed', 'toolCalls', 'toolFailed',
              'inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens',
              'peakInputTokens', 'peakCacheReadTokens', 'peakCacheWriteTokens', 'peakOutputTokens',
            ]
            const mergedByKey = new Map()
            for (const row of rows) {
              const key = row.modelKey || normalizeModelId(row.model)
              let group = mergedByKey.get(key)
              if (group === undefined) {
                group = { model: key, modelKey: key, members: [], providers: [] }
                for (const field of MERGED_FIELDS) group[field] = 0
                mergedByKey.set(key, group)
              }
              if (!group.members.includes(row.model)) group.members.push(row.model)
              for (const provider of row.providers || []) {
                if (!group.providers.includes(provider)) group.providers.push(provider)
              }
              for (const field of MERGED_FIELDS) group[field] += row[field] || 0
            }
            // 注意：`deepseek-flash` 既是"服务模型键"又是其中一个原始 id，同一个字符串在
            // 两种口径下答案不同（合并后 ¥3 vs 单行 ¥2）。所以不用字符串去猜意图，而是按
            // 调用方分开：`costOf(原始 id)` 走单行（首页逐行汇总才不会重复计数），
            // `costOfMerged(服务模型键)` 走合并行（明细页一张卡一个数字）。
            const mergedRowOf = (key) => mergedByKey.get(key)
            const rowFor = (model) => rowOf(model) || mergedRowOf(normalizeModelId(model))
            const priceOf = (model) => {
              // Host 已把价格表的键归一化，统计行也带 modelKey；旧版快照没有该字段，
              // 退回本地别名折叠，保证与 Host 计费口径一致。
              const row = rowOf(model)
              const p = priceMap[model] || (row && priceMap[row.modelKey]) || priceMap[normalizeModelId(model)]
              return p
                ? { currency: p.currency || 'USD', input: p.input, output: p.output, cacheRead: p.cacheRead, cacheWrite: p.cacheWrite, peak: p.peak || null, peak2: p.peak2 || null }
                : { currency: 'USD', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, peak: null, peak2: null }
            }
            // 费用公式：高峰 token 走高峰价（高峰价留空则为 0 → 按正常价），
            // 其余走正常价；结果换算到目标货币。
            const costFrom = (counts, p) => {
              if (!p) return null
              if (!(p.input > 0 || p.output > 0 || p.cacheRead > 0 || p.cacheWrite > 0)) return null
              const peak = p.peak && p.peak.enabled ? p.peak : null
              const peakPrice = (normal, peakVal) => (peak && peakVal > 0 ? peakVal : normal)
              const own = (
                (counts.inputTokens - counts.peakInputTokens) * p.input + counts.peakInputTokens * peakPrice(p.input, peak && peak.input)
                + (counts.cacheReadTokens - counts.peakCacheReadTokens) * p.cacheRead + counts.peakCacheReadTokens * peakPrice(p.cacheRead, peak && peak.cacheRead)
                + (counts.cacheWriteTokens - counts.peakCacheWriteTokens) * p.cacheWrite + counts.peakCacheWriteTokens * peakPrice(p.cacheWrite, peak && peak.cacheWrite)
                + (counts.outputTokens - counts.peakOutputTokens) * p.output + counts.peakOutputTokens * peakPrice(p.output, peak && peak.output)
              ) / 1e6
              return (own / rateOf(p.currency)) * rateOf(target)
            }
            const costOf = (model) => {
              const row = rowOf(model)
              if (!row) return null
              return costFrom(row, priceOf(model))
            }
            /** 合并行的费用：明细页按"提供服务的模型"一张卡一个数字，与首页汇总对得上。 */
            const costOfMerged = (key) => {
              const row = mergedRowOf(key)
              if (!row) return null
              return costFrom(row, priceOf(key))
            }
            // 趋势图按 modelKey 归一（旧 id 与新 id 合并成一条线）。
            const keyOfModel = (model) => ((rowFor(model) || {}).modelKey) || normalizeModelId(model)
            // 台账里的按模型计数用短字段名（i/r/w/o/pi/pr/pw/po）压缩 payload。
            const countsOf = (slim) => (slim ? {
              inputTokens: slim.i || 0,
              cacheReadTokens: slim.r || 0,
              cacheWriteTokens: slim.w || 0,
              outputTokens: slim.o || 0,
              peakInputTokens: slim.pi || 0,
              peakCacheReadTokens: slim.pr || 0,
              peakCacheWriteTokens: slim.pw || 0,
              peakOutputTokens: slim.po || 0,
            } : null)
            // 一个时间点的"总量"或"某模型的量"，按指标取 token 或已换算费用。
            const seriesPoint = (() => {
              const cache = new WeakMap()
              return (point, priceKey) => {
                let entry = cache.get(point)
                if (!entry) {
                  entry = {}
                  cache.set(point, entry)
                }
                if (entry[priceKey]) return entry[priceKey]
                const totalCounts = {
                  inputTokens: point.inputTokens || 0,
                  cacheReadTokens: point.cacheReadTokens || 0,
                  cacheWriteTokens: point.cacheWriteTokens || 0,
                  outputTokens: point.outputTokens || 0,
                  peakInputTokens: point.peakInputTokens || 0,
                  peakCacheReadTokens: point.peakCacheReadTokens || 0,
                  peakCacheWriteTokens: point.peakCacheWriteTokens || 0,
                  peakOutputTokens: point.peakOutputTokens || 0,
                }
                const byModel = point.byModel || {}
                let tokens = 0
                let cost = 0
                if (priceKey === 'total') {
                  for (const slim of Object.values(byModel)) {
                    tokens += (slim.i || 0) + (slim.r || 0) + (slim.w || 0) + (slim.o || 0)
                  }
                  if (Object.keys(byModel).length === 0) {
                    tokens = totalCounts.inputTokens + totalCounts.cacheReadTokens + totalCounts.cacheWriteTokens + totalCounts.outputTokens
                  }
                  // 总量费用按每个模型各自的单价求和，才不会被单一单价带偏。
                  for (const [name, slim] of Object.entries(byModel)) {
                    const own = costFrom(countsOf(slim), priceOfByKey(name))
                    cost += own === null ? 0 : own
                  }
                } else {
                  const slim = byModel[priceKey]
                  if (slim) {
                    tokens = (slim.i || 0) + (slim.r || 0) + (slim.w || 0) + (slim.o || 0)
                    const own = costFrom(countsOf(slim), priceOfByKey(priceKey))
                    cost = own === null ? 0 : own
                  }
                }
                entry[priceKey] = { tokens, cost }
                return entry[priceKey]
              }
            })()
            const priceOfByKey = (key) => {
              let price = priceMap[key] || presetMap[key]
              if (!price) return { currency: 'USD', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, peak: null, peak2: null }
              // 时点规则：官方公布的改路由时点之后，该 id 实际由目标模型提供服务，
              // 按目标模型的价格结算。V4-Pro 在 2026-09-14 04:00 UTC 之后即如此。
              if (price.rerouteFrom && price.rerouteTo && Date.now() >= Date.parse(price.rerouteFrom)) {
                const target = priceMap[price.rerouteTo] || presetMap[price.rerouteTo]
                if (target) price = target
              }
              return price
            }
            const metricOf = (point, metric, key) => {
              if (metric === 'tools') {
                const byModel = point.byModel || {}
                if (key === 'total') {
                  let calls = 0
                  for (const slim of Object.values(byModel)) calls += slim.tc || 0
                  // 没有按模型明细的旧点时，退回桶级总量。
                  if (Object.keys(byModel).length === 0) calls = point.toolCalls || 0
                  return calls
                }
                return (byModel[key] || {}).tc || 0
              }
              const value = seriesPoint(point, key)
              return metric === 'cost' ? value.cost : value.tokens
            }
            const formatValue = (value, metric) => (metric === 'cost' ? fmtMoney(value) + ' ' + target : fmt(value))
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
                peakTimezone: peak.timezone || 'UTC',
                // weekdays 为 undefined 表示每天生效；UI 用「仅周一至周五」勾选表达。
                peakWeekdaysOnly: Array.isArray(peak.weekdays),
                peakInput: String(peak.input > 0 ? peak.input : ''),
                peakOutput: String(peak.output > 0 ? peak.output : ''),
                peakCacheRead: String(peak.cacheRead > 0 ? peak.cacheRead : ''),
                peakCacheWrite: String(peak.cacheWrite > 0 ? peak.cacheWrite : ''),
                peak2Enabled: peak2.enabled === true,
                peak2Start: peak2.start || '',
                peak2End: peak2.end || '',
                peak2Timezone: peak2.timezone || 'UTC',
                peak2WeekdaysOnly: Array.isArray(peak2.weekdays),
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
                    timezone: d.peakTimezone || 'UTC',
                    // 未勾选「仅工作日」时显式传 null：Host 把 null 视为"每天生效"，
                    // 与数组语义区分开。
                    weekdays: d.peakWeekdaysOnly ? [1, 2, 3, 4, 5] : null,
                    input: d.peakInput,
                    output: d.peakOutput,
                    cacheRead: d.peakCacheRead,
                    cacheWrite: d.peakCacheWrite,
                  },
                  peak2: {
                    enabled: !!d.peak2Enabled,
                    start: d.peak2Start || '',
                    end: d.peak2End || '',
                    timezone: d.peak2Timezone || 'UTC',
                    weekdays: d.peak2WeekdaysOnly ? [1, 2, 3, 4, 5] : null,
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
              const preset = presetFor(presetMap, model, rowFor(model))
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

            // 明细页按"提供服务的模型"分行（与首页花费去向同口径）：退役 id 不再单独成卡，
            // 否则 deepseek-flash 在首页是 183 元、在明细页变成 8 元 + 131 元两个数字。
            const modelSet = new Set(Array.from(mergedByKey.keys()))
            for (const key of Object.keys(priceMap)) modelSet.add(key)
            // 排序口径与"花费去向"一致：按费用降序。原先按调用次数排，会和上面那张
            // 按费用排的图给出两个不同的第一名，读者要在脑子里做一次对账。
            // 无价格或未调用的模型没有可比金额，统一沉到末尾再按名称排。
            const allModels = Array.from(modelSet).sort((a, b) => {
              const ca = costOfMerged(a)
              const cb = costOfMerged(b)
              if (ca === null && cb === null) return a.localeCompare(b)
              if (ca === null) return 1
              if (cb === null) return -1
              return cb - ca || a.localeCompare(b)
            })

            const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0)
            const totalFailed = rows.reduce((sum, r) => sum + r.failed, 0)
            const totalTokens = rows.reduce((sum, r) => sum + r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens + r.outputTokens, 0)
            const totalCost = rows.reduce((sum, r) => sum + (costOf(r.model) || 0), 0)
            // 缓存命中率：被计费的提示词里有多少来自缓存命中（分母不含输出）。
            const billedPromptTokens = totalTokens - rows.reduce((sum, r) => sum + r.outputTokens + r.reasoningTokens, 0)
            const cachedTokens = rows.reduce((sum, r) => sum + r.cacheReadTokens, 0)
            const cacheHitPct = billedPromptTokens > 0 ? Math.round(cachedTokens / billedPromptTokens * 1000) / 10 : null
            // 趋势图的系列：按归一后的键合并旧 id，取用量前几名，其余在组件里归"其他"。
            const daySeries = view.daySeries || []
            const hourSeries = view.hourSeries || []
            const modelTotals = {}
            for (const point of daySeries) {
              for (const [name, slim] of Object.entries(point.byModel || {})) {
                modelTotals[name] = (modelTotals[name] || 0) + (slim.i || 0) + (slim.r || 0) + (slim.w || 0) + (slim.o || 0)
              }
            }
            const trendModels = Object.keys(modelTotals).sort((a, b) => modelTotals[b] - modelTotals[a])
            // 效率指标：只统计"快照下发窗口内"的天，与趋势图口径一致。
            // 工具名是逐桶各存一份的，直接相加会重复计数，所以同一天内取最大值近似。
            // 占比与效率都基于 rows（全量，与三个关键数字同口径）。趋势卡是唯一
            // 按时间窗口呈现的卡片，因为它本身讲的就是"随时间变化"。
            const shareSeries = new Map()
            const effStats = { toolCalls: 0, toolFailed: 0, calls: 0, totalCost: 0, tokensPerCall: null }
            const toolTally = new Map()
            let effTokens = 0
            for (const row of rows) {
              effStats.toolCalls += row.toolCalls || 0
              effStats.toolFailed += row.toolFailed || 0
              effStats.calls += row.calls || 0
              const tokens = row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens + row.outputTokens
              effTokens += tokens
              // 占比按归一键合并旧 id，避免同一个模型的旧 id 拆成两行。
              const name = row.modelKey || normalizeModelId(row.model)
              const entry = shareSeries.get(name) || { model: name, tokens: 0, cost: 0, members: [] }
              entry.tokens += tokens
              entry.cost += costOf(row.model) || 0
              if (!entry.members.includes(row.model)) entry.members.push(row.model)
              shareSeries.set(name, entry)
            }
            // 高频工具只存在于时间桶里（工具名不按模型存全量），因此这一项仍取窗口内近似最大值。
            for (const point of daySeries) {
              for (const [name, counts] of Object.entries(point.tools || {})) {
                const previous = toolTally.get(name) || 0
                if ((counts.calls || 0) > previous) toolTally.set(name, counts.calls || 0)
              }
            }
            const topTools = Array.from(toolTally.entries())
              .map(([name, calls]) => ({ name, calls }))
              .sort((a, b) => b.calls - a.calls)
            effStats.tokensPerCall = effStats.calls > 0 ? Math.round(effTokens / effStats.calls) : null
            const shareMetricValue = (entry) => (shareMetric === 'cost' ? entry.cost : entry.tokens)
            const shareEntries = Array.from(shareSeries.values())
              .filter((entry) => shareMetricValue(entry) > 0)
              .sort((a, b) => shareMetricValue(b) - shareMetricValue(a))
              .map((entry) => ({ model: entry.model, value: shareMetricValue(entry), members: entry.members }))


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

            const shownModels = onlyUsed ? allModels.filter((m) => rowFor(m)) : allModels

            const field = (model, keyName, label, value) => React.createElement('div', { className: 'mu-field' },
              React.createElement('div', { className: 'mu-field-label' }, label),
              React.createElement('input', { className: 'mu-input', type: 'number', min: '0', step: 'any', placeholder: '0', value, onChange: (e) => setDraft(model, keyName, e.target.value) }))
            const curOptions = CURRENCIES.map((c) => React.createElement('option', { key: c, value: c }, c))

            // DeepSeek 官方高峰窗口以 UTC 定义，因此默认 UTC；另提供服务器本地时区
            // 与常用对比时区，便于核对官方中文页的北京时间口径。
            const WEEKDAY_ONLY = [1, 2, 3, 4, 5]
            const TIMEZONE_PRESETS = [
              { value: 'UTC', label: 'UTC' },
              { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
            ]
            const localTimezone = (() => {
              try {
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
                return zone && !TIMEZONE_PRESETS.some((entry) => entry.value === zone) ? zone : null
              } catch {
                return null
              }
            })()
            const timezoneOptions = (current) => {
              const values = TIMEZONE_PRESETS.map((entry) => ({ value: entry.value, label: entry.label }))
              if (localTimezone) values.push({ value: localTimezone, label: localTimezone + '（本地）' })
              // 数据里可能出现别的时区（手改过数据文件，或旧版本写入），补一项免得上屏时被吞掉。
              if (current && !values.some((entry) => entry.value === current)) values.push({ value: current, label: current })
              return values
            }
            // 单个高峰时段的时段/时区/星期控件。
            const peakWindowRow = (model, n, d, prefix) => React.createElement('div', { className: 'mu-peak-window' },
              React.createElement('div', { className: 'mu-peak-time' },
                React.createElement('span', { className: 'mu-field-label' }, t('peakPeriod', { n })),
                React.createElement('input', { className: 'mu-input', style: { maxWidth: '64px' }, placeholder: n === 1 ? '01:00' : '06:00', value: d[prefix + 'Start'] || '', onChange: (e) => setDraft(model, prefix + 'Start', e.target.value) }),
                React.createElement('span', null, '—'),
                React.createElement('input', { className: 'mu-input', style: { maxWidth: '64px' }, placeholder: n === 1 ? '04:00' : '10:00', value: d[prefix + 'End'] || '', onChange: (e) => setDraft(model, prefix + 'End', e.target.value) }),
                React.createElement('select', { className: 'mu-select', value: d[prefix + 'Timezone'] || 'UTC', onChange: (e) => setDraft(model, prefix + 'Timezone', e.target.value) },
                  timezoneOptions(d[prefix + 'Timezone']).map((entry) => React.createElement('option', { key: entry.value, value: entry.value }, entry.label))),
                React.createElement('label', { className: 'mu-peak-toggle' },
                  React.createElement('input', { type: 'checkbox', checked: !!d[prefix + 'WeekdaysOnly'], onChange: (e) => setDraft(model, prefix + 'WeekdaysOnly', e.target.checked) }),
                  t('weekdaysOnly'))),
              React.createElement('div', { className: 'mu-hint' }, t('timeHint')))

            const head = React.createElement('div', { className: 'mu-head' },
              React.createElement('div', { className: 'mu-title' }, t('title')),
              // 版本标签：重启是否真的换上了新代码，一眼可查。
              view.pluginVersion
                ? React.createElement('span', { className: 'mu-version', title: t('versionHint') }, 'v' + view.pluginVersion)
                : null)

            // 只留三个真正影响决策的数字：花了多少、用了多少（缓存命中直接给）、还剩多少。
            // calls / failed 这类次要计数下沉到各模型卡片，不再占主视觉。
            const bigMetrics = React.createElement('div', { className: 'mu-big' },
              React.createElement('div', { className: 'mu-big-card' },
                React.createElement('div', { className: 'mu-big-value' }, fmtMoney(totalCost) + ' ' + target),
                React.createElement('div', { className: 'mu-big-label' }, t('totalCost'))),
              React.createElement('div', { className: 'mu-big-card' },
                React.createElement('div', { className: 'mu-big-value' }, fmt(totalTokens)),
                React.createElement('div', { className: 'mu-big-label' }, t('totalTokens')),
                React.createElement('div', { className: 'mu-big-sub' },
                  cacheHitPct === null ? t('cacheHintNone') : t('cacheHitValue', { pct: cacheHitPct }))),
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

            // 次要计数：一行小字，不再用 chips 跟主数字抢注意力。
            const summary = React.createElement('div', { className: 'mu-subline' },
              t('callsShort', { calls: fmt(totalCalls) }),
              ' · ',
              t('failedShort', { failed: fmt(totalFailed) }),
              totalFailed > 0 && totalCalls > 0
                ? ' (' + (Math.round(totalFailed / (totalCalls + totalFailed) * 1000) / 10) + '%)'
                : '',
              ' · ',
              t('cacheHitValue', { pct: cacheHitPct === null ? '—' : cacheHitPct }))

            // 每行在总费用里的占比：搬进行内后，用户不必在"花费去向"与模型列表之间对账。
            let costTotal = 0
            for (const model of shownModels) {
              const value = costOfMerged(model)
              if (value !== null) costTotal += value
            }
            const cardOf = (model) => {
              // 明细页的 model 是"提供服务的模型"键：取合并行，费用与首页汇总一致。
              const row = mergedRowOf(model) || rowFor(model)
              const d = draftOf(model)
              const cost = row ? costOfMerged(model) : null
              const hasPrice = !!priceMap[model]
              const expanded = !!open[model]
              // 每张卡片只给两行信息：一行"花了多少"，一行 token 明细（单行内联，
              // 不再用四列网格占掉一整屏高）。费用是决策依据，所以放主位。
              const hitPct = row && (row.inputTokens + row.cacheReadTokens) > 0
                ? Math.round(row.cacheReadTokens / (row.inputTokens + row.cacheReadTokens) * 1000) / 10
                : null
              const tokenLine = (label, value, color) => React.createElement('span', { className: 'mu-token-item', key: label },
                React.createElement('span', { className: 'mu-legend-dot', style: { background: color } }),
                React.createElement('span', { className: 'mu-token-label' }, label),
                React.createElement('span', { className: 'mu-token-value' }, fmt(value)))
              return React.createElement('div', { className: 'mu-card', key: model },
                React.createElement('div', {
                  className: 'mu-card-head' + (row ? ' mu-card-head-clickable' : ''),
                  onClick: row ? () => togglePrice(model) : undefined,
                  title: row ? t('expandHint') : undefined,
                },
                  React.createElement('div', { className: 'mu-model', title: model }, model),
                  row ? React.createElement('div', { className: 'mu-provider', title: row.providers.join(', ') }, row.providers.join(', ')) : null,
                  React.createElement('div', { className: 'mu-card-figure' },
                    React.createElement('span', { className: cost === null ? 'mu-cost mu-cost-none' : 'mu-cost' },
                      cost === null ? (hasPrice ? t('noUsage') : t('notConfigured')) : fmtMoney(cost) + ' ' + target),
                    React.createElement('span', { className: 'mu-cost-sub' },
                      t('callMeta', { calls: fmt(row ? row.calls : 0) })
                      + (row && row.failed ? t('failedMeta', { failed: row.failed }) : '')
                      + (hitPct === null ? '' : ' · ' + t('cacheHitShort', { pct: hitPct }))
                      + (row && row.members && row.members.length > 1 ? ' · ' + t('mergedIds', { n: row.members.length }) : ''))),
                  cost !== null && costTotal > 0
                    ? React.createElement('span', { className: 'mu-cost-share' }, '· ' + (Math.round(cost / costTotal * 1000) / 10) + '%')
                    : null),
                // 费用占比条单独占一行：与下面的 token 构成条各归其位（一个是钱、一个是量），
                // 也避免挤进费用那一列把金额顶宽。
                cost !== null && costTotal > 0
                  ? React.createElement('span', { className: 'mu-share-track mu-share-track-sm' },
                      React.createElement('span', { className: 'mu-share-bar', style: { width: Math.max(cost / costTotal * 100, 1.5) + '%', background: 'var(--dsw-alias-brand-primary)' } }))
                  : null,
                // 默认只给一行摘要：费用 + 调用数 + 构成条。token 明细按需展开，
                // 否则 5 个模型铺开就是 550px，主信息被淹没。
                row ? React.createElement(StackBar, {
                  parts: [
                    { key: 'input', value: row.inputTokens, color: TOKEN_COLORS.input, title: t('cacheMiss') + ': ' + fmt(row.inputTokens) },
                    { key: 'cacheRead', value: row.cacheReadTokens, color: TOKEN_COLORS.cacheRead, title: t('cacheRead') + ': ' + fmt(row.cacheReadTokens) },
                    { key: 'cacheWrite', value: row.cacheWriteTokens, color: TOKEN_COLORS.cacheWrite, title: t('cacheWrite') + ': ' + fmt(row.cacheWriteTokens) },
                    { key: 'output', value: row.outputTokens, color: TOKEN_COLORS.output, title: t('output') + ': ' + fmt(row.outputTokens) },
                  ],
                }) : null,
                row && expanded ? React.createElement('div', { className: 'mu-token-line' },
                  tokenLine(t('cacheMiss'), row.inputTokens, TOKEN_COLORS.input),
                  tokenLine(t('cacheRead'), row.cacheReadTokens, TOKEN_COLORS.cacheRead),
                  tokenLine(t('cacheWrite'), row.cacheWriteTokens, TOKEN_COLORS.cacheWrite),
                  tokenLine(t('output'), row.outputTokens, TOKEN_COLORS.output)) : null,
                // 合并说明放在展开区：默认收起时明细页与首页数字完全一致，
                // 想核对"这 183 元是哪来的"再展开看每个历史 id 的分项。
                row && expanded && row.members && row.members.length > 1
                  ? React.createElement('div', { className: 'mu-merge-list' },
                      React.createElement('div', { className: 'mu-hint' }, t('mergedFrom', { ids: row.members.join('、') })),
                      row.members.map((member) => {
                        const m = rowOf(member)
                        if (!m) return null
                        const tokens = m.inputTokens + m.cacheReadTokens + m.cacheWriteTokens + m.outputTokens
                        return React.createElement('div', { className: 'mu-merge-row', key: member },
                          React.createElement('span', { className: 'mu-merge-id', title: member }, member),
                          React.createElement('span', { className: 'mu-merge-meta' },
                            t('callMeta', { calls: fmt(m.calls) }) + ' · ' + fmt(tokens) + ' tokens'))
                      }))
                  : null,
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
                              peakWindowRow(model, 1, d, 'peak'),
                              d.peak2Enabled ? peakWindowRow(model, 2, d, 'peak2') : null,
                              React.createElement('div', { className: 'mu-price-grid' },
                                field(model, 'peakInput', t('peakInput'), d.peakInput),
                                field(model, 'peakOutput', t('peakOutput'), d.peakOutput),
                                field(model, 'peakCacheRead', t('peakCacheRead'), d.peakCacheRead),
                                field(model, 'peakCacheWrite', t('peakCacheWrite'), d.peakCacheWrite)),
                              React.createElement('div', { className: 'mu-hint' }, d.peak2Enabled ? t('sharedPeak') : t('normalPeak')))
                          : null),
                      React.createElement('div', { className: 'mu-price-actions' },
                        React.createElement('button', { className: 'mu-btn', disabled: saving === model, onClick: () => savePrice(model) }, saving === model ? t('saving') : t('save')),
                        React.createElement('button', { className: 'mu-btn', disabled: !presetFor(presetMap, model, row), onClick: () => resetPrice(model) }, t('reset')),
                        React.createElement('button', { className: 'mu-btn', disabled: !hasPrice, onClick: () => removePrice(model) }, t('remove')),
                        React.createElement('span', { className: 'mu-hint' }, t('unit', { currency: d.currency || 'USD' }))))
                  : (row
                      ? null
                      : React.createElement('button', { className: 'mu-price-toggle', onClick: () => togglePrice(model) }, (hasPrice ? t('adjust') : t('configure')) + ' ▾')))
            }
            const renderCards = (list) => list.map((model) => cardOf(model))

            const addRow = React.createElement('div', { className: 'mu-add' },
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '240px' }, placeholder: t('modelPlaceholder'), value: newModel, onChange: (e) => setNewModel(e.target.value) }),
              React.createElement('button', { className: 'mu-btn', onClick: addModel }, t('add')))

            // 子页面导航。总览是落地页：只有宏观图表与结论，高度不随模型数增长；
            // 明细与配置各自成页，切过去才渲染，主页因此不会被它们撑长。
            const tabs = [
              { key: 'overview', label: t('tabOverview') },
              { key: 'models', label: t('tabModels') + (shownModels.length ? '（' + shownModels.length + '）' : '') },
              { key: 'config', label: t('tabConfig') },
            ]
            const tabBar = React.createElement('div', { className: 'mu-tabs', role: 'tablist' },
              tabs.map((entry) => React.createElement('button', {
                key: entry.key,
                role: 'tab',
                'aria-selected': tab === entry.key,
                className: 'mu-tab' + (tab === entry.key ? ' mu-tab-on' : ''),
                onClick: () => setTab(entry.key),
              }, entry.label)))

            const overview = React.createElement('div', { className: 'mu-pane' },
              // 花费与余额是最先要看的东西，放在最上方；图表回答的是"为什么"。
              bigMetrics,
              React.createElement(TrendCard, {
                t,
                daySeries,
                hourSeries,
                models: trendModels,
                modelTotals,
                metricOf,
                formatValue,
                defaultMetric: 'cost',
              }),
              // 只要 host 提供该字段就渲染这张卡。曾经写成"有数据才渲染"，
              // 于是新装或刚重启（账还是空的）时整张卡消失，看起来像功能不存在。
              Array.isArray(view.heatSeries)
                ? React.createElement(HeatmapCard, {
                    t,
                    series: view.heatSeries,
                    // 优先用跨轮累计（daysTotal）：一轮读不完语料时 `days` 只是最后一轮的增量，
                    // 显示成"已回填 1 天历史"会让实际恢复的 17 天看起来像 1 天。
                    backfilledDays: view.backfill && view.backfill.state !== 'unavailable'
                      ? (view.backfill.daysTotal !== undefined ? view.backfill.daysTotal : (view.backfill.days || 0))
                      : 0,
                  })
                : null,
              React.createElement(EfficiencyCard, {
                t,
                stats: effStats,
                topTools,
                target,
              }),
              error ? React.createElement('div', { className: 'mu-error' }, t('errorPrefix', { error })) : null,
              summary,
              // 按 dsh-context 的理念分工：首页只放"整体"的东西（趋势 / 计数 / 占比），
              // 具体模型的明细留在"模型明细"页——曾经两处都列模型卡片，纯重复。
              React.createElement(ShareCard, {
                t,
                entries: shareEntries,
                metric: shareMetric,
                onMetric: setShareMetric,
                formatValue,
              }),
              React.createElement('button', { className: 'mu-more', onClick: () => setTab('models') },
                t('openModels') + ' →'))

            const modelsPane = React.createElement('div', { className: 'mu-pane' },
              React.createElement('label', { className: 'mu-toggle mu-toggle-lead' },
                React.createElement('input', { type: 'checkbox', checked: onlyUsed, onChange: (e) => setOnlyUsed(e.target.checked) }),
                t('onlyUsed')),
              React.createElement('div', { className: 'mu-list' },
                shownModels.length
                  ? renderCards(shownModels)
                  : React.createElement('div', { className: 'mu-empty' }, onlyUsed ? t('emptyUsed') : t('empty'))))

            const configPane = React.createElement('div', { className: 'mu-pane' },
              curRow,
              bconf,
              addRow)

            return React.createElement('div', { className: 'mu-page' },
              head,
              tabBar,
              tab === 'overview' ? overview : tab === 'models' ? modelsPane : configPane)
          }

          slots.inject('settings.section', () => slots.register(
            { name: 'settings.section', id: 'model-usage', order: 30, label: () => translate('title'), locale: NS },
            (props) => React.createElement(ModelUsagePage, props),
          ))
        },
      }
    },
  })
}
