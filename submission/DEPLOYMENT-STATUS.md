# 部署与能力验证状态

验证日期：2026-08-16（Asia/Shanghai）

## 已验证

- 公网评委入口可加载应用：<https://opai.glasser.top>
- 当前发布版本为 Git 提交 `15f6d51`
- 2026-08-16 16:05 CST 已用 Chrome 复查首屏和三个 3D 场景，均完成渲染且无应用控制台错误
- 2026-08-16 16:18 CST，用户重新授权后现场完成一条真实 Aily 只读检查；`/api/health` 显示 `real_turn_verified`
- 同一事件已写入飞书多维表格并回读；`/api/health` 显示 `write_read_verified`，pending 事件为 0
- 只读检查返回 0 个场景命令，项目仍处于初始版本 `version-demo-initial`
- 应用由独立 `opai` 用户和 systemd 服务运行，Nginx 反向代理
- GitHub 仓库不包含飞书/Aily 凭据；凭据只保存在服务器受限目录
- 最终飞书文档已导入并设为互联网链接可读：<https://www.feishu.cn/docx/DnQ0dmLg1oUDbkxEsQecsxpdnWc>

## Cloudflare Tunnel 公网入口

- `opai.glasser.top` 已通过 Cloudflare CNAME 接入阿里云现有 `aliyun-relay` Tunnel
- Tunnel 将该域名转发至阿里云本机 `127.0.0.1:8080`，保留原有 `ibs1`、`anisette` 入口
- 2026-08-16 19:05 CST 外部验证：主页与 `/api/health` 均返回 HTTP 200

## 未接入

真实欧派 SKU、价格、BOM、工期、施工规则与生产系统尚未接入。当前目录为明确标记的演示数据，不能作为真实商品或报价依据。
