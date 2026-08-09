# Gate 10A Resident Test：主卧真实住户反馈

状态：住户代理给出混合结论；主任务手动路径可通，但一条更严格的整屋→主卧→衣柜路径仍报 P0 / P1，Gate 10A 还不能算完全被住户确认。

## 住户代理：更严格的整屋→主卧→衣柜路径

- 路径：整屋 3D → 主卧 → 衣柜选择 → 衣柜编辑 → 影响 → 确认。
- 反馈：
  - 能进入主卧，但在更严格的住户视角里，衣柜路径没有稳定完成到确认；
  - 住户代理直接把这条路径判成“不愿意确认”；
  - 它认为主卧 3D 入口 / 家具可发现性还有问题。
- P0：真实住户路径无法稳定完成整屋→主卧→衣柜确认闭环。
- P1：主卧 3D 房间命中反馈弱，住户很难从整屋快速知道如何纠正错误路径。
- P2：更细的衣柜参数区在低视口下仍显得偏长。
- 是否愿意确认：不愿意。
- 证据路径：
  - `.omx/audits/gate10a/persona-storage/failed-current-state.png`
  - `.omx/audits/gate10a/persona-storage/00-home-whole-3d.png`
  - `.omx/audits/gate10a/persona-storage/01-main-bedroom-entered.png`
  - `.omx/audits/gate10a/persona-storage/audit-events.json`
  - `.omx/audits/gate10a/persona-storage/run-cdp-audit.mjs`

## 主任务手动路径：可用但不等于全员确认

- 路径：主任务的后台 headless Chrome 已成功完成主卧进入、床侧 warning、衣柜 2200 mm、暖白材质、确认和刷新回放。
- 反馈：
  - 主卧闭环能跑通；
  - 录屏 / 抽帧也显示镜头移动没有再出现明显抖动。
- 但这不能覆盖住户代理给出的 P0 / P1，所以 Gate 10A 仍待修。
- 证据路径：
  - `.omx/audits/gate10a/01-home.png`
  - `.omx/audits/gate10a/05-bedside-warning.png`
  - `.omx/audits/gate10a/07-v3-storage-impact.png`
  - `.omx/audits/gate10a/09-reload-persisted.png`
  - `.omx/audits/gate10a/orbit-zoom.mp4`
  - `.omx/audits/gate10a/orbit-zoom-contact-sheet.png`

## 住户测试结论

- Gate 10A 已经证明“主卧可以被做出来”，但还没证明“所有真实住户都能顺滑完成这条路”。
- 这份测试的价值在于把 P0 / P1 拦在当前 Gate，而不是把它们拖到 Gate 10B 才爆。
