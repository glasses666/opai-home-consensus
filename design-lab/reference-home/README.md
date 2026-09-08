# Real-plan reference home

Source: [首开·熙悦丽博选房手册](https://www.bjfsh.gov.cn/zwgk/zfbz/202208/P020220822344918196348.pdf), Beijing Fangshan government host, PDF page 8 (printed 11/12), C type: three bedrooms, two living areas, two bathrooms, approximately 89 m² gross area. Downloaded 2026-09-08; SHA-256 `64dac3559c05ba6a74c60b6cbb1c1f25f7d3d5ee1561171f2bc113d5bdaefefa`. Text extraction omitted graphical dimensions; the rasterized page was visually checked. Original PDF stays outside public application assets.

Source dimensions: frontage 1,650 + 1,750 + 3,200 = 6,600 mm; east depth 2,850 + 2,600 + 1,500 + 3,550 = 10,500 mm; kitchen depth 3,550 mm; balcony recess 550 mm and depth 1,200 mm. These are drawing dimension chains, not certified interior clear dimensions. Never describe this as surveyed or construction-ready.

Assumptions: partitions 120 mm, exterior walls 180 mm, height 2,800 mm; net door/window sizes, guest/child corridor notch and bathroom subdivisions estimated. Public vanity simplified into bathroom; shafts, AC platforms, columns and bays omitted. Furniture is our proposal, not developer-supplied. Wardrobe relocated to avoid bed collision. Bathroom equipment and kitchen appliances are still pending.

`app/src/domain/reference-home.js` owns geometry for both 2D and 3D. Collinear shared boundaries become one physical wall. Door holes reference those walls. `/project/reference-home` is an independent in-memory preview: edits use SceneCommand/undo but reset on reload. Old demo, saved versions, backend data and public deployment are untouched.

319 tests and build passed: independent identity, canonical validation, collisions, connected rooms and move/undo/rejection. A blank canvas was a loading overlay whose dismissal CSS only applied inside the old host; fixed locally. Future editor hosts must be visually checked, not merely checked for successful downloads or zero console errors.

Browser acceptance: desktop 1440×1000 verified real 3D, matching 2D, bedroom navigation, explicit furniture-edit mode, canvas bed selection, 100 mm movement and undo. Mobile 390×844 verified real 3D and no document horizontal overflow after constraining the grid minimum width. Zero page errors; no old project snapshot keys written. Mobile whole-home framing is tighter than desktop and can be zoomed out; bathroom fixtures remain unfinished.

Vault owner `10_Projects/PRJ-2026-008-oppein-ai-home-consensus/00_Project_Home.md` was read and remains pre-existing dirty work. It was not overwritten. Source-local Markdown preserves this outcome pending that conflict gate. No commit/push/deployment.
