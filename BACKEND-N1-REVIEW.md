# 夜间后端包 N1 审阅

日期：2026-08-09

范围：只构建后端地基；Gate 3 页面尚未开始。

## 已完成

1. **SceneCommand 事务**
   - store 固定保存 initial scene、命令历史与 cursor。
   - 支持确定性 replay、undo、redo 和撤销后分支。
   - 单命令失败不改旧 store；同一 Agent turn 任一工具失败会回滚本轮全部写入。

2. **最小确定性规则**
   - 继续复用原有结构校验与房间边界。
   - 新增同房间对象碰撞与受保护净距检查。
   - hard block 禁止提交；warning 可提交并保留可读说明。
   - 这只是编辑地基，不冒充 Gate 6 的完整室内设计规范。

3. **Agent Harness**
   - 工具：检查房间 / 对象、移动、旋转、修改对象材质、修改表面材质。
   - `沙发向右移动20厘米`、`餐桌旋转90度`、`沙发改成橡木色` 都会产生真实 SceneCommand。
   - provider 只看到脱敏 scene 摘要与工具合同；非法工具、非法参数、越界和规则冲突不会污染场景。
   - provider 超时、异常或格式错误时只降级一次到确定性本地解析。

4. **飞书与 BFF**
   - Node 标准库 BFF：`GET /api/health`、`POST /api/agent/turn`。
   - 优先支持团队智能体 Chat API；保留旧 Aily Session / Run 链路。
   - Base Activity 按 Event ID 幂等写入，写后必须搜索回读一致才标记 ready。
   - Base 临时失败不回滚本地场景，事件进入进程内 pending 队列等待后续请求重试。
   - 没有新增 npm 依赖，浏览器不读取飞书 token。

## 真实验证

- `npm test`：41 项通过，覆盖 Gate 1 / Gate 2 回归、事务、规则、Harness、Aily 两条合同和 BFF。
- `npm run build`：通过；保留既有单包体积 warning，没有引入新的构建错误。
- Base：`evt-n1-live-readback-20260809` 写入并回读同一 record `recvrJ7pFAdHkq`，随后 health 为 `ready / write_read_verified`。
- Aily：开发后台自定义智能体 `agent_4kt39w75byxw5cf` 已开启 OpenAPI 渠道并发布；`evt-n1-aily-live-20260809-0916` 真实返回合法 `move_object`，trace 为 `source: provider`、`fallbackReason: null`。
- 完整链路已回读 Base record `recvrL3in2XEYy`；同一进程 health 为 `Aily ready / real_turn_verified`、`Base ready / write_read_verified`、`pendingBaseEvents: 0`。

## 仍未完成

- 没有持久化项目版本、登录权限、多用户、家庭共识、设计师复核、报价 / BOM 或生产对接。
- pending Base 队列和场景状态只在当前 Node 进程内；公网或生产部署前必须换成持久存储。
- 当前 Aily 只承担结构化意图与工具选择；专业设计知识、澄清策略与家庭冲突调解仍属于后续 Gate，不因这次 API 验收而宣称完成。
- 没有改 `/lab/scene`，没有创建 `/project/demo`，没有提前进入 Gate 3。

## 下一步

1. 等用户明确开始 Gate 3 后，再把这套 BFF / Harness 接入新的家庭主工作空间；不回头改已验收的 Gate 2 技术页。
2. Gate 3 先做页面和 2D / 3D 导航框架；专业 Agent 调教继续按后续 Gate 单独验收，避免在错误页面地基上提前堆功能。
