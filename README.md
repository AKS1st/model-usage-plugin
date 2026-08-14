# 模型消耗统计插件（musage-stats）

一个运行在 DeepSeek Harness（DSH）Web 里的静态 Cordis 插件：统计各模型的 tokens 消耗、内置主流模型默认价格、实时汇率换算、查询 API Key 余额，并在 Web 设置的"模型消耗"页签中展示。

## 功能

- **按模型 id 统计消耗**：拦截每次流式模型调用（`llm/stream` 瀑布流），聚合 输入（未命中）/ 缓存命中 / 缓存写入 / 输出 tokens、调用次数与失败次数；一个模型 id 聚合为一条（多个 provider 共用同一 id 时合并）。
- **内置主流模型默认价格**（$ / 百万 tokens）：国产模型（DeepSeek / 通义 Qwen / Kimi / 智谱 GLM）按 CNY 计价，海外模型（OpenAI / Anthropic / Google Gemini）按 USD 计价；首次观测到某模型时自动套用其预设价。
- **汇率换算器**：通过在线 API（open.er-api.com 主源，frankfurter 备用）获取实时汇率，失败自动回退内置通常值；汇率**仅在用户手动点击"更新汇率"时刷新**。目标货币可切换（默认 CNY），所有费用统一换算展示。
- **API Key 余额查询**：查询 DeepSeek 账户余额并在页面顶部大字展示；Key 解析链为「页面填写（仅会话内存）→ credentials 服务 `DEEPSEEK_API_KEY` → 环境变量」。
- **持久化**：统计、价格、目标货币、余额配置写入 `$DSH_HOME/musage-stats.json`（tmp + rename 原子写、失败重试、损坏自动降级），进程重启后自动恢复。
- **页面**：设置面板独立页签"模型消耗"；顶部大号展示总 Token 与账户余额；"仅显示已调用模型"开关隐藏未启用模型；每模型卡片可折叠展开价格配置（计价货币 + 4 个单价）。

## 架构

| 半部 | 载体 | 职责 |
| --- | --- | --- |
| Host | `index.js` | 拦截 `llm/stream` 统计；汇率/余额查询（node 全局 fetch）；持久化；`webServer` 注册 `/__musage-stats` 路由（GET 快照 / POST 操作） |
| Browser | `client.js` | `window.__ModuleLoader__` 模块，注册 `settings.section` 页签，通过 `fetch('/__musage-stats')` 与 Host 通信 |

## 安装

```bash
./install.sh
```

脚本会把包文件复制到 `$DSH_HOME/profiles/web/node_modules/musage-stats/` 并确保 `cordis.patch.yml` 存在挂载行，幂等可重跑。

生效说明：
- 挂载行经 profile 的 config-only HMR 即时生效，无需重启。
- 浏览器 UI 修改刷新页面即生效（服务端实时读取）。
- **Host 代码修改需要重启 `dsh web` 进程**（web 组合禁用了模块热重载）。

## 数据与安全

- 数据文件：`$DSH_HOME/musage-stats.json`（统计 / 价格 / 目标货币 / 余额配置 / 最近余额结果）。
- **API Key 不明文落盘**：页面填写的余额 Key 仅保存在进程内存，跨重启持久化请配置 `DEEPSEEK_API_KEY` 凭证或环境变量。
- 路由 `/__musage-stats` 为 localhost 部署设计，未做跨源校验。

## 审计状态

已通过 deepseek-v4-pro 子代理的插件规范审计（PASS-WITH-NOTES），并按报告修复了 major（API Key 明文落盘）与高价值 minor（写盘失败重试、加载归一化、添加模型预设回退、POST 错误 JSON、中断调用计数等）。

## License

MIT
