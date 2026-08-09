# Gate 10A Resident Test：主卧真实住户反馈

状态：首轮住户代理暴露的可发现性问题已修复；主任务真实指针闭环复测通过，独立补测运行器超时，Gate 10A 仍等待用户验收。

## 首轮住户代理：暴露入口与对象可发现性

- 路径：整屋 3D → 主卧 → 衣柜选择 → 衣柜编辑 → 影响 → 确认。
- 反馈：
  - 代理多次以固定坐标点击整屋 3D 和紧凑 2D，实际落点先后位于开放客餐厅和沙发，并非主卧 / 衣柜；
  - 这不能证明 canonical scene 或衣柜编辑损坏，但说明住户不应靠猜坐标寻找房间和家具；
  - 由此补上了整屋主卧标签、2D / 3D 操作提示，以及主卧房间卡中的“床 / 衣柜”直达入口。
- 初始 P0 判定：不成立；失败步骤是错误坐标输入，不是进入正确对象后仍无法完成。
- 有效 P1：主卧入口 / 家具可发现性不足；已修复并由主任务真实指针路径复测。
- P2：更细的衣柜参数区在低视口下仍显得偏长。
- 是否愿意确认：不愿意。
- 证据路径：
  - `.omx/audits/gate10a/persona-storage/failed-current-state.png`
  - `.omx/audits/gate10a/persona-storage/00-home-whole-3d.png`
  - `.omx/audits/gate10a/persona-storage/01-main-bedroom-entered.png`
  - `.omx/audits/gate10a/persona-storage/audit-events.json`
  - `.omx/audits/gate10a/persona-storage/run-cdp-audit.mjs`

## 修复后主任务真实指针路径

- 路径：后台 headless Chrome 以真实鼠标 / 键盘事件完成 2D 主卧进入、床侧 warning、保存 V2、通过“衣柜”直达入口设置宽度 2200 mm、查看收纳影响、保存并确认 V3、刷新回放。
- 反馈：
  - 主卧闭环能跑通；
  - `flow-result.json` 记录刷新后仍为 `V3`、衣柜宽度 `2200`、收纳影响可见、无跨房间规则泄漏、控制台异常为空；
  - 149 帧录屏 / 抽帧显示镜头连续，没有检测到突变帧或整墙消失。
- 证据路径：
  - `.omx/audits/gate10a/01-home.png`
  - `.omx/audits/gate10a/05-bedside-warning.png`
  - `.omx/audits/gate10a/07-v3-storage-impact.png`
  - `.omx/audits/gate10a/09-reload-persisted.png`
  - `.omx/audits/gate10a/orbit-zoom.mp4`
  - `.omx/audits/gate10a/orbit-zoom-contact-sheet.png`

## 住户测试结论

- Gate 10A 已证明主卧闭环和修复后的可发现路径可运行；当前没有可复现 P0 / P1。
- 独立补测代理未在时限内产出结果，已终止；因此不声称“所有真实住户都顺滑完成”，最终体验判断仍由用户验收。
- P2 保留：低视口下衣柜属性区偏长，次级说明文字偏小；后续页面 polish 时处理，不阻塞 Gate 10B 的同源能力验证。
