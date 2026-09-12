# Real-plan reference home

Source: [首开·熙悦丽博选房手册](https://www.bjfsh.gov.cn/zwgk/zfbz/202208/P020220822344918196348.pdf), Beijing Fangshan government host, PDF page 8 (printed 11/12), C type: three bedrooms, two living areas, two bathrooms, approximately 89 m² gross area. Downloaded 2026-09-08; SHA-256 `64dac3559c05ba6a74c60b6cbb1c1f25f7d3d5ee1561171f2bc113d5bdaefefa`. Text extraction omitted graphical dimensions; the rasterized page was visually checked. Original PDF stays outside public application assets.

Source dimensions: frontage 1,650 + 1,750 + 3,200 = 6,600 mm; east depth 2,850 + 2,600 + 1,500 + 3,550 = 10,500 mm; kitchen depth 3,550 mm; balcony recess 550 mm and depth 1,200 mm. These are drawing dimension chains, not certified interior clear dimensions. Never describe this as surveyed or construction-ready.

Assumptions: partitions 120 mm, exterior walls 180 mm, height 2,800 mm; net door/window sizes, guest/child corridor notch and bathroom subdivisions estimated. Public vanity simplified into bathroom; shafts, AC platforms, columns and bays omitted. Furniture is our proposal, not developer-supplied. Wardrobe relocated to avoid bed collision. Bathroom equipment and kitchen appliances are still pending.

`app/src/domain/reference-home.js` owns geometry for both 2D and 3D. Collinear shared boundaries become one physical wall. Door holes reference those walls. `/project/reference-home` is an independent in-memory preview: edits use SceneCommand/undo but reset on reload. Old demo, saved versions, backend data and public deployment are untouched.

319 tests and build passed: independent identity, canonical validation, collisions, connected rooms and move/undo/rejection. A blank canvas was a loading overlay whose dismissal CSS only applied inside the old host; fixed locally. Future editor hosts must be visually checked, not merely checked for successful downloads or zero console errors.

Browser acceptance: desktop 1440×1000 verified real 3D, matching 2D, bedroom navigation, explicit furniture-edit mode, canvas bed selection, 100 mm movement and undo. Mobile 390×844 verified real 3D and no document horizontal overflow after constraining the grid minimum width. Zero page errors; no old project snapshot keys written. Mobile whole-home framing is tighter than desktop and can be zoomed out; bathroom fixtures remain unfinished.

Vault owner `10_Projects/PRJ-2026-008-oppein-ai-home-consensus/00_Project_Home.md` was read and remains pre-existing dirty work. It was not overwritten. Source-local Markdown preserves this outcome pending that conflict gate. No commit/push/deployment.

## 2026-09-10 master-bedroom story adaptation

The old main-bedroom style story was adapted to the corrected L-shaped room without moving the user-confirmed bed or wardrobe. A 2,200 × 80 × 2,100 mm feature panel is mounted to the canonical east wall and gets its own camera preset; its baseline finish is warm white so an AI preview can visibly change it without pretending the room was already redesigned.

Camera acceptance needs the transition to finish before judging the frame. A first close camera showed only a cropped bed and artwork; a second camera placed in the narrow entry notch sat behind a full-height partition and looked broken while flying. The working preset stays inside the main bedroom polygon near the south side, looks back toward the headboard, and was checked after the camera settled. This boundary matters for other non-rectangular rooms: a point can be inside a room polygon yet still sit on the wrong side of an internal wall for the intended sightline.

An isolated local project used the live provider with the natural request “主人房总觉得有点冷。床和衣柜都留下，先从床头和颜色开始，别加大件。” DeepSeek returned a legal two-command preview: feature wall to light oak, bed to warm linen. The requirement state preserved both existing objects and prohibited new large furniture; deterministic rules passed, the version drawer showed exactly two material diffs, and keep-preview enabled save. This is a local provider result, not public-deployment evidence.

## 2026-09-10 visual correction after user review

The preceding material-command result was not sufficient visual proof: the user correctly found the style change weak and the art flickering. The 180 mm east wall has an inner face at x=6510; the old panel at x=6560 was embedded in it. The replacement panel is 2200×40×2100 mm at x=6485, leaving 5 mm to the wall and 15 mm to the unchanged bed footprint. Do not fix this by disabling depth testing or exempting collisions.

`app/scripts/build_bedroom_assets.py` builds two original bedroom-only GLBs: walnut/linen bed with sage and rust textiles, and layered wall composition with geometric artwork. The artwork is actual geometry, not the old image metadata. A first visual check caught coplanar green/clay artwork layers; these were separated at the mesh level before re-export. Bed and wardrobe canonical transforms remain the user's 14-object baseline. The guest-room Fab bed is untouched. The main-bedroom camera now shows the bed rather than cropping to artwork. Hidden-tab material synchronization is no longer skipped.

Native hidden in-app browser check at 1280×720: local project `exp-639bf5c4-3026-4007-a6e6-829e25c4e091` shows the new geometry, intact artwork and wall clearance in the main workbench. Original projects were not migrated or overwritten. This is a developer-authored default style, not a new live DeepSeek generation claim. The owning Vault project home and visual-reference note are already dirty, so this correction is recorded here without overwriting those notes. No production deployment or push.

Final checks: 445/445 tests, build and diff check passed; overhead → feature camera and reopening the same saved project in another hidden tab preserved the new scene. Mobile viewport and browser console collection were not repeated. Asset SHA256: bed `0d3adf831bf2c0d212f702e3f55de9968f003dac7c1395652fa98b4e0f10d13f`, feature `62753ab03938f59ca82d93cdbcab0097ae9050fc584723cebbcbe499ab92be30`. Evidence is bound to the uncommitted local worktree and these payloads, not the public deployment.

### Bedside cabinet and lamp addition

On user request, added `object-primary-bedside`: a movable 460×420×1000mm assembly including a 545mm-high walnut/stone-top cabinet, sage drawers, ceramic lamp and a book. Position x6200/z8800 clears the existing bed and feature panel without moving either. The warm shade is an emissive material, not a claim of photometrically calibrated room lighting. The original dedicated bed/feature GLBs were not regenerated; the script now accepts a selected asset after `--`.

The first build's handle protruded 4mm beyond the declared footprint; the exporter rejected it, and the handle was fitted inside the 420mm depth. Use Blender `--python-exit-code 1`: Python exceptions otherwise can still result in a zero process exit status. Final GLB bound check passed. 446 tests and build passed, including move/undo and canonical collision validation. Native hidden in-app browser at 1280×720 showed the real cabinet/lamp beside the bed and `V2 · 已保存`.

The current project `exp-639bf5c4-3026-4007-a6e6-829e25c4e091` was updated through `object.add`, replayable version history and the authorized local save API with expectedRevision, not a disk snapshot overwrite. A read-back proved all previous objects and surfaces unchanged and the new group retained; V1 remains recoverable. Relevant Vault home/visual-reference notes remain pre-existing dirty and were not overwritten; source-local notes own this outcome. No push or deployment; mobile/console-specific checks not repeated.

### Whole-bedroom wall composition after user correction

The bedside addition did not address the user's actual concern: the feature panel ended halfway across the wall, and shared walls retained unrelated finishes. The new original `bedroom-surround.glb` is 3380×40×2700mm with continuous warm plaster, lower walnut wainscot, bed-aligned artwork and a narrow fluted window-end detail. It replaces the panel at x6485/z8710 while retaining the 5mm wall clearance. Old feature and bed assets remain unchanged for earlier saved versions. All furniture transforms and openings were preserved.

Seven physical boundary walls now support a validated `roomMaterialIds` finish per adjacent room. Canonical geometry identifies the physical front/back; Pascal hydration explicitly classifies external faces and maps shared faces without repainting neighbouring rooms. This is necessary because wall ownership alone is not the same as which room sees a wall face, and hydration does not run space detection. Main-bedroom faces share warm ivory; the floor uses smoked light oak and the wardrobe material uses linen putty without replacing its textured asset.

The same local project was saved as V3/revision 2 through 13 SceneCommands and the version-checked API; read-back matched the submitted scene, with V1/V2 retained. Background native browser at 1280×720 verified saved V3 from the bedside feature view and the whole-room overhead view. This is authored styling, not a new live DeepSeek result. Tests cover seven faces, neighbouring finishes, invalid room/material rejection, replay, undo and version diffs. Removing a room-finish override is not currently a supported replay operation; setting another valid finish is supported. No mobile or console-specific check was repeated for this revision.

Experience boundary: review the complete room envelope and shared-wall orientation before adding decorative objects to an isolated camera view. The owning Vault home and visual-reference note remain pre-existing dirty work; this source-local Markdown records the verified correction without overwriting them. No commit, push or deployment.

Final local validation: 448/448 tests, production build and `git diff --check` passed. Build retains the existing >500kB chunk warnings. Evidence base is HEAD `392f024` plus the current uncommitted changes; surround SHA256 `89801faf6fb90f21e5ddc6db3530e889c1af487a68d57a380d3d2232efe52a29`, wall-finishes source `5610454533d5f7732d1421de318b5c462af720ba380510a4a597955808385fb1`, reference-home source `b845dd7b0714662617ae06b21fe4e36e720c6c912a0686b0fe48ea8f8fb1c4ed`. Browser evidence is local saved V3 at port5180 (API8794), authored scene/provider not invoked, 2026-09-10. The rendered page was nonblank, had no framework overlay and responded to overhead→bedside camera controls; console collection and mobile were not repeated.
