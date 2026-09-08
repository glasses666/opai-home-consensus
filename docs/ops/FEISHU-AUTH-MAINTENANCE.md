# 飞书线上授权恢复与续期维护

2026-09-07，用户授权恢复线上飞书登录并保持持久性。仅修改认证维护设施，不发布新版网页，不改变 DeepSeek，也不发送消息或写入多维表格业务记录。

## 验证结果

- 本机与线上服务账号是同一飞书应用、同一用户，但各自管理登录态。最初公网 health 报 `user_token_invalid`。
- 按线上 systemd 的 `opai` 用户、HOME 与 PATH 执行 `lark-cli auth status --json --verify` 后成功续期，用户凭据有效且包含既有权限及 `offline_access`；未重新扫码、未从本机复制凭据、未扩大授权范围。
- 续期后 access expiry 为 2026-09-07 19:23:34 +08:00，refresh expiry 为 2026-09-14 17:23:34 +08:00。这些是本次观察值，不是永久保证。
- 公网已不再报告认证失效，Aily / Base 分别仍为 `real_turn_not_verified` / `real_write_not_verified`；不能把登录恢复当成真实业务闭环通过。
- 新维护服务以实际线上账号启动，`Result=success`、`ExecMainStatus=0`、安全日志 `status=ready`。289 项本地测试通过，含错误输出不泄露凭据测试。

## 维护设施

- 2026-09-07 按用户要求，将本服务加入既有 `opai` / “OPAI 服务维护守护”自动化，目标任务 `01a03a03-2dfb-7c51-8ab9-648374bdcd75`（监控）。保留 ACTIVE 和每三小时巡检；不新增重复自动化。已通过 App 更新并回读配置，且向指定任务发送只读复核交接。
- 外层监控检查 timer 启用/活跃/下次时间、service 最近执行结果与安全摘要，超过 90 分钟未执行需复核。oneshot 成功后的 inactive 不算故障；只修复授权 timer/service，不连带重启网站。认证失效独立告警，`real_turn_not_verified` / `real_write_not_verified` 不冒充认证失败；禁止通过业务写入探活，禁止自动扩大 OAuth 权限。

- 源码：[续期检查脚本](../../app/scripts/feishu-auth-maintenance.mjs)、[测试](../../app/tests/feishu-auth-maintenance.test.mjs)。CLI 按需刷新，脚本只调用其原生验证命令，不自行管理 refresh token。
- [service](opai-feishu-auth.service) 部署为 `/etc/systemd/system/opai-feishu-auth.service`。
- [timer](opai-feishu-auth.timer) 部署为 `/etc/systemd/system/opai-feishu-auth.timer`，已 enabled/active。开机约 2 分钟后检查，随后每 30 分钟检查，最多 60 秒错峰。
- 运行脚本位于 `/opt/opai/maintenance/feishu-auth-maintenance.mjs`，root 管理、服务用户只读。登录态仍在 `/opt/opai/home/.lark-cli`，目录 700，master key 600。
- 日志只含状态与到期时间；不透传 CLI stdout/stderr。失败退出非零，并在下一周期再检查；没有新增对外通知或自动重授权。
- 手动复验：`systemctl start opai-feishu-auth.service`；查看 `systemctl show opai-feishu-auth.service -p Result -p ExecMainStatus` 和 `systemctl list-timers opai-feishu-auth.timer`。
- 回滚维护机制：`systemctl disable --now opai-feishu-auth.timer`。此操作不注销已有飞书登录。

## 经验与边界

初次将脚本放在 shared 目录时，服务用户无法穿过该目录而启动失败；没有放宽密钥目录权限，改为独立只读维护目录后运行成功。shared 中首次上传的无密钥脚本副本仍保留，不参与运行。

只证明此次原生续期成功和定时设施可执行，尚未等待下一次 access expiry 或经历机器重启。用户撤销授权、管理员变更、refresh token 失效、长时间网络故障仍可能要求重新登录；不能承诺永久授权。此前具体为何出现失效未完全定位，未擅自认定是固定过期策略或复制凭据冲突。

## 持久化状态

源码仓库基线为 `2f7b7be`；维护文件与测试新增，尚未得到本轮 commit 指令，因此保留未提交。之前首页、设计工程等改动不动。AgentVault 欧派项目主页仍有重叠未提交修改，本轮未覆盖、未同步；本 Markdown 为源工作区的 Obsidian 兼容运维记录。
