# Design QA

final result: passed

## 审核范围

- `/project/demo`：消费者工作台、2D / 3D 同源浏览、对象编辑、Agent、家庭共识、版本面板。
- `/review/project-demo`：设计师复核页。
- `/handoff/version-demo-initial`：共识交接页。
- `/lab/scene`：保留为 Gate 1 / 2 技术验证页，不作为主交付入口。

## 设计判断

- 信息架构保持当前产品合同：3D 是主浏览和编辑面，2D 是同步只读总览，不回到旧的静态图片热点原型。
- 视觉风格维持浅木、暖白、克制层级和家具目录感；没有使用 IKEA logo、蓝黄品牌配色或复制商品图。
- 复核与交接被放在独立页面，不恢复旧的客户 / 设计师模式切换。
- 产品状态清楚暴露 demo / estimate / pending，不冒充真实欧派报价、SKU、BOM、生产或施工接口。

## 验证证据

- `cd app && npm test`：129/129 通过。
- `cd app && npm run test:backend`：74/74 通过。
- `cd app && npm run build`：通过；保留 Vite 大 chunk 警告。
- `cd app && npm run eval:agent`：28/28 通过，`passed: true`。
- 路由 smoke：
  - `/project/demo`：200，title `欧派 AI 家庭共创设计器 V1`。
  - `/review/project-demo`：200，title `欧派 AI 家庭共创设计器 V1`。
  - `/handoff/version-demo-initial`：200，title `欧派 AI 家庭共创设计器 V1`。
  - `/lab/scene`：200，title `欧派 AI 家庭共创设计器 V1`。

## 已知视觉 / 体验边界

- 本次没有调用可用的远程浏览器插件做逐像素截图对比；浏览器能力返回不可用，因此采用构建、路由和自动化测试作为 Gate 12 证据。
- Vite 报告单 chunk 超过 500 kB；V1 本地 Demo 可接受，正式部署前建议做 Three.js / 页面路由 code splitting。
- 1024×768 可用性已通过 CSS 结构约束和构建检查，但仍建议用户明早在真实浏览器中手动验收关键路径。
- `/lab/scene` 仍保留为技术验证入口；若比赛交付需要更干净的 URL，可在部署时隐藏。
