# Gate 5 Review：全部家具的直接编辑与撤销

状态：已实现、已验证，等待用户验收。

## 本 Gate 构建了什么

- `/project/demo` 从只读展示切到 live `SceneStore`，2D 总览和 3D 浏览读取同一份当前 scene。
- 3D 中选中 movable 家具后显示 TransformControls，可在 3D 里移动或旋转；规则拒绝时回滚 mesh，不写脏状态。
- 右侧属性区提供移动模式、旋转模式、100 mm 方向微调、15°旋转、材质切换、尺寸修改、复制、删除、撤销和重做。
- 新增 `SceneCommand`：`object.setDimensions`、`object.duplicate`、`object.delete`；所有编辑仍通过同一命令入口和设计规则校验。
- 复制先试相邻四方向，再在所属房间内找第一个合法落位；没有合法落位时保留原 scene 并解释失败。
- 2D 家具俯视、3D mesh、对象详情和 URL 选择状态随命令同步。

## 本 Gate 没做什么

- 未实现“替换家具”。当前没有真实替代资产 / 目录映射；硬做会变成假功能，留给目录与 Agent Gate。
- 未实现完整设计规范可视化。本 Gate 只使用已有边界、碰撞、门扇和净距底线防止数据损坏。
- 未做专业 CAD 式编辑；2D 仍是同步总览，不承担拖拽编辑。

## 修掉的问题

- 修复右侧编辑工具被 `.project-object > div` 误设成横向 flex，导致尺寸、复制、删除按钮跑出面板的问题。
- 修复 3D 手柄提交失败时返回值判断过宽，规则拒绝后仍可能被视为成功的问题。
- 修复尺寸表单在 headless / CDP 输入路径下 submit 不可靠的问题，改为按钮直接应用尺寸。
- 加固 GLB 加载：模型缓存、尺寸归一、失败占位和材质克隆继续保持 Gate 4 的可降级行为。

## 验证证据

- 自动化：`npm --prefix app test`，94 passed / 0 failed。
- 构建：`npm --prefix app run build` 通过。
- 浏览器运行时：
  - 3D status 为 `ready`，GLB `9/9`，console 无未处理错误。
  - 1440×900 面板 overflow 为 0。
  - 旋转后复制沙发成功，GLB 从 `9/9` 到 `10/10`。
  - 宽度从 `2200` 改为 `2300` 后，对象详情更新为 `2300 × 900 × 820 mm`。
- 截图：
  - `.omx/audits/gate5/runtime/02-edit-panel-fixed.png`
  - `.omx/audits/gate5/runtime/04-duplicate-after-rotate.png`
  - `.omx/audits/gate5/runtime/05-dimensions-updated.png`

## 已知边界

- 复制采用简单网格搜索；如果未来家具数量变多，需要更好的候选点策略。
- 当前 TransformControls 是基础可编辑手柄，尚未做吸附线、合法区热力图和 warning 确认，这属于 Gate 6。
- 黑盒 QA 子 agent 仍在后台运行；若返回 P1 以上问题，应在进入 Gate 6 前补修。
