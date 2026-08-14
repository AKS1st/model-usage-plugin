/**
 * musage-stats — browser half.
 *
 * 在 Web 设置的"模型消耗"页签渲染统计与价格配置。与 Host 半部通过
 * /__musage-stats 路由通信（GET 拉取快照，POST 提交操作），数据持久化
 * 由 Host 负责（$DSH_HOME/musage-stats.json）。
 */
if (typeof window !== 'undefined' && typeof window.__ModuleLoader__ !== 'undefined') {
  window.__ModuleLoader__.load({
    id: 'musage-stats',
    factory(require) {
      const React = require('react')
      const API = '/__musage-stats'

      const getStats = () => fetch(API, { cache: 'no-store' }).then((res) => res.json())
      const postAction = (body) => fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((res) => res.json())

      return {
        apply(ctx) {
          const slots = ctx.get('slots')
          if (slots === undefined) return

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

          function ModelUsagePage() {
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
              getStats().then((res) => {
                setView(res)
                setError(null)
              }).catch((err) => {
                setError((err && err.message) || String(err))
              })
            }, [])

            React.useEffect(() => {
              refresh()
              postAction({ action: 'refresh-balance' }).then(refresh).catch(() => refresh())
              const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 5000)
              return () => window.clearInterval(timer)
            }, [refresh])

            if (view === null) {
              return React.createElement('div', { className: 'mu-page' },
                React.createElement('div', { className: 'mu-error' }, error ? ('加载失败：' + error) : ''),
                React.createElement('div', null, error ? '正在自动重试…' : '正在加载模型消耗数据…'))
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
              return p ? { currency: p.currency || 'USD', input: p.input, output: p.output, cacheRead: p.cacheRead, cacheWrite: p.cacheWrite } : { currency: 'USD', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
            }
            const rowOf = (model) => rows.find((r) => r.model === model)
            const costOf = (model) => {
              const row = rowOf(model)
              if (!row) return null
              const p = priceOf(model)
              if (!(p.input > 0 || p.output > 0 || p.cacheRead > 0 || p.cacheWrite > 0)) return null
              const own = (row.inputTokens * p.input + row.cacheReadTokens * p.cacheRead + row.cacheWriteTokens * p.cacheWrite + row.outputTokens * p.output) / 1e6
              return (own / rateOf(p.currency)) * rateOf(target)
            }
            const draftOf = (model) => {
              const d = drafts[model]
              if (d) return d
              const p = priceOf(model)
              return { currency: p.currency, input: String(p.input || ''), output: String(p.output || ''), cacheRead: String(p.cacheRead || ''), cacheWrite: String(p.cacheWrite || '') }
            }
            const setDraft = (model, field, value) => {
              setDrafts((prev) => {
                const base = prev[model] || priceOf(model)
                return { ...prev, [model]: { ...base, [field]: value } }
              })
            }
            const togglePrice = (model) => setOpen((prev) => ({ ...prev, [model]: !prev[model] }))
            const savePrice = (model) => {
              const d = draftOf(model)
              setSaving(model)
              postAction({ action: 'set-price', model, price: { currency: d.currency, input: d.input, output: d.output, cacheRead: d.cacheRead, cacheWrite: d.cacheWrite } })
                .then(() => { setSaving(null); refresh() })
                .catch((err) => { setSaving(null); setError((err && err.message) || String(err)) })
            }
            const removePrice = (model) => {
              postAction({ action: 'remove-price', model })
                .then(refresh)
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
              : (balance.status === 'loading' ? '查询中…' : (balance.status === 'error' ? '查询失败' : '未查询'))
            const balSub = balance.status === 'ok'
              ? (balance.infos.length > 1
                  ? balance.infos.map((i) => i.currency + ' ' + fmtMoney(i.total)).join(' · ')
                  : ('余额更新于 ' + (balance.updatedAt ? balance.updatedAt.slice(0, 16).replace('T', ' ') : '-')))
              : (balance.status === 'error'
                  ? (balance.message || '查询失败')
                  : (balance.status === 'loading' ? '正在查询账户余额…' : '点击"查询余额"获取'))

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
              React.createElement('div', { className: 'mu-title' }, '模型消耗统计'))

            const bigMetrics = React.createElement('div', { className: 'mu-big' },
              React.createElement('div', { className: 'mu-big-card' },
                React.createElement('div', { className: 'mu-big-value' }, fmt(totalTokens)),
                React.createElement('div', { className: 'mu-big-label' }, '总 Token')),
              React.createElement('div', { className: 'mu-big-card' },
                React.createElement('div', { className: balClass }, balValue),
                React.createElement('div', { className: 'mu-big-label' }, '账户余额'),
                React.createElement('div', { className: 'mu-big-sub' }, balSub)))

            const curRow = React.createElement('div', { className: 'mu-cur' },
              React.createElement('span', { className: 'mu-cur-label' }, '目标货币'),
              React.createElement('select', { className: 'mu-select', value: target, onChange: (e) => setTarget(e.target.value) }, curOptions),
              React.createElement('span', { className: 'mu-rate' }, '汇率 USD→' + target + ' ' + fmtRate(rateOf(target))),
              React.createElement('span', { className: view.ratesSource === 'live' ? 'mu-badge-live' : 'mu-badge-default' }, view.ratesSource === 'live' ? '实时' : '默认值'),
              React.createElement('button', { className: 'mu-btn', disabled: busy === 'rates', onClick: refreshRates }, busy === 'rates' ? '更新中…' : '更新汇率'),
              React.createElement('button', { className: 'mu-btn', disabled: balBusy, onClick: refreshBalance }, balBusy ? '查询中…' : '查询余额'),
              React.createElement('button', { className: 'mu-btn', onClick: () => setBconfOpen((v) => !v) }, bconfOpen ? '收起余额配置' : '余额配置'),
              React.createElement('label', { className: 'mu-toggle' },
                React.createElement('input', { type: 'checkbox', checked: onlyUsed, onChange: (e) => setOnlyUsed(e.target.checked) }),
                '仅显示已调用模型'))

            const bconf = bconfOpen ? React.createElement('div', { className: 'mu-bconf' },
              React.createElement('span', { className: 'mu-bconf-label' }, 'API Key（留空则用 DEEPSEEK_API_KEY）'),
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '200px' }, type: 'password', placeholder: 'sk-...', value: bconfApiKey, onChange: (e) => setBconfApiKey(e.target.value) }),
              React.createElement('span', { className: 'mu-bconf-label' }, '余额接口 Base URL'),
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '200px' }, placeholder: 'https://api.deepseek.com', value: bconfBaseUrl, onChange: (e) => setBconfBaseUrl(e.target.value) }),
              React.createElement('button', { className: 'mu-btn', onClick: saveBconf }, '保存并查询')) : null

            const summary = React.createElement('div', { className: 'mu-summary' },
              chip('调用', fmt(totalCalls)),
              chip('tokens', fmt(totalTokens)),
              chip('费用(' + target + ')', fmtMoney(totalCost)),
              chip('失败', fmt(totalFailed)))

            const cards = shownModels.map((model) => {
              const row = rowOf(model)
              const d = draftOf(model)
              const cost = row ? costOf(model) : null
              const hasPrice = !!priceMap[model]
              const expanded = !!open[model]
              const meta = row
                ? fmt(row.calls) + ' 次调用' + (row.failed ? ' · 失败 ' + row.failed : '') + ' · 费用 ' + (cost === null ? '-' : fmtMoney(cost) + ' ' + target) + (cost === null && !hasPrice ? '（未配置价格）' : '')
                : '尚未调用'
              return React.createElement('div', { className: 'mu-card', key: model },
                React.createElement('div', { className: 'mu-card-head' },
                  React.createElement('div', { className: 'mu-model', title: model }, model),
                  row ? React.createElement('div', { className: 'mu-provider', title: row.providers.join(', ') }, row.providers.join(', ')) : null,
                  React.createElement('div', { className: 'mu-meta' }, meta)),
                row ? React.createElement('div', { className: 'mu-grid' },
                  cell('未命中', fmt(row.inputTokens)),
                  cell('缓存命中', fmt(row.cacheReadTokens)),
                  cell('缓存写入', fmt(row.cacheWriteTokens)),
                  cell('输出', fmt(row.outputTokens))) : null,
                expanded
                  ? React.createElement('div', { className: 'mu-price' },
                      React.createElement('div', { className: 'mu-price-cur' },
                        React.createElement('span', { className: 'mu-field-label' }, '计价货币'),
                        React.createElement('select', { className: 'mu-select', value: d.currency || 'USD', onChange: (e) => setDraft(model, 'currency', e.target.value) }, curOptions)),
                      React.createElement('div', { className: 'mu-price-grid' },
                        field(model, 'input', '输入', d.input),
                        field(model, 'output', '输出', d.output),
                        field(model, 'cacheRead', '缓存命中', d.cacheRead),
                        field(model, 'cacheWrite', '缓存写入', d.cacheWrite)),
                      React.createElement('div', { className: 'mu-price-actions' },
                        React.createElement('button', { className: 'mu-btn', disabled: saving === model, onClick: () => savePrice(model) }, saving === model ? '保存中…' : '保存'),
                        React.createElement('button', { className: 'mu-btn', disabled: !hasPrice, onClick: () => removePrice(model) }, '移除'),
                        React.createElement('span', { className: 'mu-hint' }, '单价单位：' + (d.currency || 'USD') + ' / 百万 tokens · 展示按目标货币换算')))
                  : React.createElement('button', { className: 'mu-price-toggle', onClick: () => togglePrice(model) }, (hasPrice ? '调整价格' : '配置价格') + ' ▾'))
            })

            const addRow = React.createElement('div', { className: 'mu-add' },
              React.createElement('input', { className: 'mu-input', style: { maxWidth: '240px' }, placeholder: '模型 id，如 deepseek-chat（预配置价格）', value: newModel, onChange: (e) => setNewModel(e.target.value) }),
              React.createElement('button', { className: 'mu-btn', onClick: addModel }, '添加'))

            return React.createElement('div', { className: 'mu-page' },
              head,
              bigMetrics,
              curRow,
              bconf,
              error ? React.createElement('div', { className: 'mu-error' }, '错误：' + error) : null,
              summary,
              React.createElement('div', { className: 'mu-list' }, cards.length ? cards : React.createElement('div', { className: 'mu-empty' }, onlyUsed ? '暂无模型调用记录，发送消息后自动统计（取消勾选"仅显示已调用模型"可查看价格配置）' : '暂无模型，可通过下方输入框添加')),
              addRow)
          }

          slots.inject('settings.section', () => slots.register(
            { name: 'settings.section', id: 'model-usage', order: 30, label: '模型消耗' },
            () => React.createElement(ModelUsagePage, null),
          ))
        },
      }
    },
  })
}
