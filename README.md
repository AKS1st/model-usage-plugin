# 模型消耗统计（model-usage-plugin）

DeepSeek Harness（DSH）Web 插件：统计各模型 tokens 消耗并估算费用，显示 API 账户余额。

![设置面板"模型消耗"页签效果](image.png)

## 功能

- 按模型统计 tokens（区分缓存命中 / 未命中 / 写入）、调用与失败次数，估算费用
- 内置主流模型默认价格（国产模型按人民币、海外模型按美元），首次使用自动套用，可随时修改
- 峰谷定价：每个模型可勾选"峰谷定价"，最多支持两个高峰时段（HH:MM，支持跨零点），
  两个高峰时段共用同一组高峰价；高峰期 token 按高峰价计费，非高峰期按正常价计费（高峰价留空则沿用正常价）
- DeepSeek 默认价按官方最新峰谷计费更新：deepseek-v4-flash / deepseek-v4-pro 预置
  官方 2026-08-17 定价（空闲价与高峰价、两个高峰时段 09:00–12:00 / 14:00–18:00，
  服务器本地时间），deepseek-chat / deepseek-reasoner 为官方最新价；
  已知 DeepSeek 模型若仍停留在旧默认价或峰谷时段为空，启动时自动升级为官方默认配置
  （已配置有效高峰时段的用户自定义价格不受影响）
- 汇率换算：费用统一按目标货币展示（默认人民币）。汇率成功获取后连同时间戳缓存到数据文件，
  无缓存时启动自动刷新一次；打开设置页时缓存不超过一周不自动刷新（需手动点击"更新汇率"），
  无缓存或超过一周自动刷新一次
- 查询 DeepSeek 账户余额，页面顶部大字展示总 Token 与账户余额
- 设置面板"模型消耗"页签；"仅显示已调用模型"可隐藏未使用过的模型

## 安装

从 GitHub 仓库安装（纯 JS，零构建，即装即用）：

```bash
dsh plugin --profile web add github:AKS1st/model-usage-plugin
dsh web   # 重启 web 服务使 profile 生效
```

本地安装（clone 后直接指向仓库目录）：

```bash
git clone https://github.com/AKS1st/model-usage-plugin.git
dsh plugin --profile web add /path/to/model-usage-plugin
dsh web
```

通过 `dsh plugin`（pnpm 转发）安装到 profile，并自动登记为 bundle 层。卸载：

```bash
dsh plugin --profile web remove model-usage-plugin
```

## 使用

打开 设置 → 模型消耗：

- 顶部：总 Token、账户余额、目标货币与汇率状态
- 每模型卡片：token 明细与费用；点"配置价格"可修改单价与计价货币、启用峰谷定价并设置
  高峰期时间段与高峰价，或点"重置"恢复默认价
- 勾选"仅显示已调用模型"时只展示实际使用过的模型

## 数据与隐私

- 统计、价格与汇率缓存（含时间戳）保存在 `$DSH_HOME/musage-stats.json`
- 页面填写的余额 API Key 仅保存在内存，不会写入磁盘；需持久化时请配置 `DEEPSEEK_API_KEY` 环境变量或凭证

## License

MIT
