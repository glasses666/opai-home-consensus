# OPAI 本地候选：启动、范围与回退

此目录服务本次个人需求引导 → 真实空间调整 → 可选飞书讨论的交付。生产尚未发布；不把本地通过等同公网通过。

## 本机运行

工作目录：`/Users/dracoglasser/Documents/欧派家居/app`。

```sh
npm run experience -- --existing-opai-provider
```

该显式开发选项只读本机已有 OPAI 服务器的 DeepSeek 配置，并仅放入当前服务进程内存。不会写生产配置或把密钥送入前端。默认后端为 `127.0.0.1:8794`，隔离数据为 `app/.data/experience-candidate`。不复制或公开该数据目录。

另开本地终端：

```sh
npm run dev:experience
```

入口：`http://127.0.0.1:5180/project/demo`。无项目参数会建立独立体验项目；项目令牌仅属于该浏览器，不能把 URL 当作共享编辑授权。原始已确认户型/家具不被覆写。该脚本将 5180 的 API 代理固定到 8794；不要用未配置代理的普通 `npm run dev` 配合此隔离后端。

在具备正常服务端环境变量的部署环境，可用原有 `npm run server`；它已接入相同 experience runtime，不依赖另一套演示后端。需要实际 `DEEPSEEK_API_KEY`、模型 `deepseek-v4-flash`、正确 endpoint，以及专用 Feishu family Base/Aily 配置。不能把开发代理模型替代产品模型。

### 设计对话的深度思考（2026-09-10）

主工作台 `/api/experience/projects/:id/turn` 默认走 `callDesignDeepSeek`：`thinking.type=enabled`、`reasoning_effort=high`，输出与推理合计预算 8192 tokens。开启时不发送无效的 temperature 参数；35 秒单次请求、85 秒总回合、6 步上限仍有效，不无限重试。旧的一次性 Agent/first-plan 接口保留原先各自预算，不能将其结果当作新主工作台的思考模式证据。

“本轮依据与执行记录”区分请求配置与接口实际返回的推理证据，显示 API 报告的推理 token 数（若有）。不保存或展示原始 `reasoning_content`；历史回复不回填新标记。真实返回模型可能名为 `deepseek-flash`，trace 同时保留请求的 `deepseek-v4-flash`。

需要本地对照/回退时，用 `DEEPSEEK_DESIGN_THINKING=disabled npm run experience -- --existing-opai-provider` 重新启动对应后端。默认强度可用服务端 `DEEPSEEK_DESIGN_REASONING_EFFORT=low|high|max` 配置；无效值明确失败，不静默改模式。该配置不下发密钥，不修改生产服务。只有开启思考不代表对话质量提高，必须分别评价引导、约束和真实动作。

## 检查与构建

```sh
npm test
npm run build
```

构建输出为 `app/dist`。包含完整本地现有资源；目录总体体积不等于首屏下载体积。仅用于授权范围内的本地验收/候选部署，不能把原始视频、受限资产或秘密加入公开 Git。

验收已构建文件（不走开发 HMR）：

```sh
OPAI_API_ORIGIN=http://127.0.0.1:8794 npx vite preview --host 127.0.0.1 --port 5185 --strictPort
```

入口 `http://127.0.0.1:5185/project/demo`。显式绑定 IPv4，避免仅监听 `::1` 时用 127.0.0.1 访问失败。实际 dist 已用电脑工具隐藏页检查桌面、375×844 手机实时 3D 和讨论入口，不切换用户前台。移动端默认轻量总览，需要点击“进入实时 3D”。这是桌面浏览器手机视口，不替代真机 Safari 测试。

最终交付必须在全新临时目录中重新安装、测试与构建；不复用早期缺文件或混入工作区内容的目录。完整源码候选可以直接从包含本文件的提交使用 `git archive`，但 **compact candidate 不能把整个 Git 归档覆盖进既有精简基线**：仓库中仍有合法保留的历史设计资产，这样会重新带入不属于精简交付的内容。精简候选应从已核验的 allowlist/manifest 重建；若基于上一精简候选增量重组，只覆盖目标提交相对上一候选的精确变更路径，再跑禁入路径、文件数和归档体积检查。归档体积异常增长时先判失败并重组，不能因为测试通过就交付。独立预览使用 **5187**，可与原工作区预览并行比较。临时目录不是稳定交付位置；最终源码提交、归档 SHA256 与构建指纹以包内 `CANDIDATE.md` 和本次交付回执为准。

候选归档包含完整 `app/public`、`app/dist` 和源代码/测试/文档，不含 `node_modules`、`.env.local`、私有项目数据或 Git 历史。在新目录解压后先 `cd app && npm ci`；随包 `.npmrc` 保持现有锁文件的 legacy peer 解析方式（Pascal 的 Next.js peer 在本 Vite 项目由局部 image/link adapter 替代），不要遗漏该文件。新机器由操作者配置已有授权的服务端环境变量，再运行 `npm run experience`（本机专用 `--existing-opai-provider` 依赖已有 SSH 配置，不是可移植凭据）。Base/Aily 的授权数据不得随包分享。

## 数据与真实边界

- 预览只改当前工作副本；保留不是保存。保存带版本检查和幂等键。
- 普通资料是有来源的参考。JSON `designConstraints` 需用户看过并确认，才进入确定性约束；不把文字指令自动当作工具权限。
- Base/Aily 仅使用本次隔离验收表。当前身份验证不等于第二个真实家庭成员已加入；真实群聊发送、新分享权限需单独授权。
- 凭据失效时只续期现有授权；扫码/新增同意由本人处理。未获授权不能用 mock 宣称飞书通过。
- 本地已有文件与测试历史保留。独立 QA 的首次失败仍计入记录，不用后来的成功覆盖。

## 安全回退

本次未发布生产，不需要对线上回滚。停止明确属于当前候选的 Node/Vite 进程即可结束本地候选，不按端口范围误停其他服务。当前配套入口为 5180/8794；保留 `.data/experience-candidate` 以便重开。

若需要比较旧代码，使用独立目录/安全 worktree，不能 reset/clean 当前用户工作。切换服务代码前先备份私有数据；旧代码不认识的新项目数据不可强行降级解析。公开与本地 Git 历史故意分离，不 pull/merge/force-push。

最终候选 commit、构建校验和、真实验收结果见同目录验收账本；没有对应证据的条目不得视作完成。
