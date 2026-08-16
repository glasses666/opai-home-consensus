# 部署与能力验证状态

验证日期：2026-08-16（Asia/Shanghai）

## 已验证

- 阿里云公网入口可加载应用：<http://8.134.145.209/project/demo?style=agent-canvas>
- 当前发布版本为 Git 提交 `15f6d51`
- 2026-08-16 16:05 CST 已用 Chrome 复查首屏和三个 3D 场景，均完成渲染且无应用控制台错误
- 2026-08-16 16:18 CST，用户重新授权后现场完成一条真实 Aily 只读检查；`/api/health` 显示 `real_turn_verified`
- 同一事件已写入飞书多维表格并回读；`/api/health` 显示 `write_read_verified`，pending 事件为 0
- 只读检查返回 0 个场景命令，项目仍处于初始版本 `version-demo-initial`
- 应用由独立 `opai` 用户和 systemd 服务运行，Nginx 反向代理
- GitHub 仓库不包含飞书/Aily 凭据；凭据只保存在服务器受限目录
- 最终飞书文档已导入并设为互联网链接可读：<https://www.feishu.cn/docx/DnQ0dmLg1oUDbkxEsQecsxpdnWc>

## 已配置但暂不可作为入口

- `opai.glasser.top` 已解析至阿里云并启用 Cloudflare 代理
- HTTPS 请求被阿里云大陆节点的 ICP 备案策略拦截
- 这是外部合规前置条件，不通过技术绕过；备案完成后可恢复域名入口

## 未接入

真实欧派 SKU、价格、BOM、工期、施工规则与生产系统尚未接入。当前目录为明确标记的演示数据，不能作为真实商品或报价依据。
