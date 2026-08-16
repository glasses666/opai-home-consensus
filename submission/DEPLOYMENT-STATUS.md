# 部署与能力验证状态

验证日期：2026-08-16（Asia/Shanghai）

## 已验证

- 阿里云公网入口可加载应用：<http://8.134.145.209/project/demo?style=agent-canvas>
- `/api/health` 返回 Agent provider 为 `aily`
- Aily 状态为 `real_turn_verified`：部署环境完成真实 Agent 回合
- 飞书多维表格状态为 `write_read_verified`：完成写入后回读
- 应用由独立 `opai` 用户和 systemd 服务运行，Nginx 反向代理
- GitHub 仓库不包含飞书/Aily 凭据；凭据只保存在服务器受限目录

## 已配置但暂不可作为入口

- `opai.glasser.top` 已解析至阿里云并启用 Cloudflare 代理
- HTTPS 请求被阿里云大陆节点的 ICP 备案策略拦截
- 这是外部合规前置条件，不通过技术绕过；备案完成后可恢复域名入口

## 未接入

真实欧派 SKU、价格、BOM、工期、施工规则与生产系统尚未接入。当前目录为明确标记的演示数据，不能作为真实商品或报价依据。
