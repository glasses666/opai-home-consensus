# Harness 数据合同与关键路径

## 需求

`hardConstraints[]` 保留现有 id/text/quote/sourceTurnId/objectIds/source 追踪；新增 `kind: lock_object`，其余 `preserve_object / lock_transform / lock_material / no_new_objects / avoid_openings` 兼容。确定性守卫不理解中文，只按已验证结构执行；中文含义由真实 planner 与独立 review 负责，不能把结构单测说成模型理解已测。

`trustedNeeds` 只有通过独立复核才更新。`turnStartRequirements` 提供回合前完整可信状态，`priorRequirements` 提供前一步状态；自动调和旧材质限制不能先删约束再把删后的状态当授权证据。失败、取消、复核拒绝均不携带未获确认的限制释放。

## 新工具

```
explore_layout({ roomId, objectIds: [existingObjectId, ...] })
  -> { options: [{ id, baseSceneDigest, items, effects, roomAfter, ruleStatus }], search }
apply_layout_option({ optionId })
  -> 一个已观察且未过期的 SceneCommand
```

选项缓存属于单回合服务端，不属于用户文本或模型生成内容。执行时核对完整序列化 base，不只比较短 hash。read-only observation 不改变 SceneStore。成功工具输出是候选，不会直接跳过质量复核提交用户场景。

## 原子命令

```json
{"type":"objects.setTransforms","items":[{"objectId":"当前场景对象ID","transform":{"x":0,"z":0,"rotationY":0}}]}
```

示例结构不是合法默认坐标。实际值只取工具计算的合法候选。items 至少1、最多24、对象不重复，允许 x/y/z/rotationY；逐对象能力检查，整组最终几何检查，不逐步碰撞；规则失败不产生部分命令。版本、undo/redo 仍由现有 SceneStore 管理。

## 观察与复核

`observeRoomLayout` 的事实包含 `factId`：room/object/surface/opening/pair/entry；度量明确标为几何代理。窗前150mm策略标为concept planning，不能在说明中包装为国标。

`candidateFacts(before, after)` 返回实体真实 pose/finish/size/add/remove 变化及改变房间前后关系。共享墙按真正改变的room face计算房间，不按物理墙的宿主误定位。

复核 contractVersion=`design-review/1`：

```json
{"accepted":false,"checks":{"goalFit":{"pass":false,"reason":"具体理由","factIds":["实际变化factId"]}},"issues":[{"code":"具体分类","detail":"哪里不匹配","factIds":[],"repair":"需增加的观察或具体修正"}]}
```

实际必须包含该阶段全部必需 checks；requirements 阶段2项，proposal 阶段6项。accepted、checks、有效 factId、失败 repair 都受确定性结构校验。preview 的目标/可感知性通过必须至少引用实际变化事实，规划者自造 factId 不得引用。重复相同失败物理结果不允许重新赌博式审查。

## 请求、trace 与失败保留

生产调用请求角色分离：真实 systemPrompt 是 system，用户、场景、历史、知识是 user 数据。固定请求 `deepseek-v4-flash`；actual model、usage、thinking/reasoning 参数来自实际适配器。未知实际型号不回填 requestedModel，设计路径拒绝未验证型号。只保存 reasoning token 数/是否出现，不输出 reasoning_content。

每次调用 `modelRequests[]` 在请求前追加，字段包含 `requestNumber / attempt / purpose / startedAt / startedAfterMs / durationMs / elapsedMs / outcome / response / error / providerTrace`。purpose 为 plan、review_requirements、review_proposal。参数保存在 providerTrace.parameters；真实耗时不使用定时动画代替。

`candidateHistory[]` 保存首次 rule_rejected 或 quality_rejected、实际工具、错误/复核和最后 reviewed_preview。兼容原 `terminationReason: legal_preview`，新的通过依据在 `trace.qualityReview.accepted`。绝不能只看旧终止字符串推断通过。

传输级异常即使没有提交对话事务，也可写入本机私有 `<projectId>.failures.jsonl`；GET `.../failed-attempts` 先按该项目 token 鉴权。失败日志不等于保存了设计版本，写日志失败也在响应auditStatus说明。

## HTTP 与产品调用方

GET `/api/experience/health` 返回服务名、contract=`harness-review/1`、turnStream=`ndjson`、sourceFingerprint。不暴露密钥是否存在或其内容。

POST `/api/experience/projects/:id/turn` 支持原JSON或 Accept:`application/x-ndjson`：

```json
{"type":"progress","phase":"observing","attempt":0,"elapsedMs":0}
{"type":"progress","phase":"reviewing","attempt":1,"elapsedMs":1234}
{"type":"result","data":{"revision":1,"conversationDelta":[],"commands":[],"scene":{},"trace":{}}}
```

错误帧 `type:error` 带稳定error分类、trace（若存在）、auditStatus；HTTP流开始后的错误不能靠状态码判断。客户端只接受一个完整终帧，截断、额外终帧、非法阶段或取消均不应用结果。`conversationDelta` 仅返回本轮两条，完整history仍由项目GET恢复。创建重试始终复用同一requestId。

## 真实本机观测输出

live runner默认目录：`.data/harness-eval/<unique>/`。
- `requests.jsonl`：同一number先started再response/error，caseId/split/variant/turn/purpose/inputSha256、actual model/参数/usage/耗时，首次结果不覆盖。
- `traces.jsonl`：每一轮产品trace。
- `outcomes.jsonl`：机械规则、独立盲审、undo/reopen、firstCandidate/firstModelRequest/repairedCandidate。
- `summary.json`：live、candidateSourceFingerprint、baselineRef、请求/错误/usage总量、未知usage次数、evaluated/automatedPass、失败、blockedOrStoppedReason、completeLedgerAcceptance。

不能把缺失usage当该次调用免费；cannot-call时requests=0且没有observedModels。模型自动分数不等于用户认可。

浏览器探针 `__OPAI_QA_READ_SCENE__` 只在开发模式且显式 `VITE_OPAI_QA_PROBE=1` 时可用。它区分 expectedCanonicalPositionM 和从实际sceneRegistry读取的 matrixWorld/actualWorldPositionM/meshes/materials/vertices/assetSettled。没有渲染实体时必须 rendered=false，不用canonical值伪造actual。正式应用不依赖探针；探针本身也不是人眼验收。
