# UE furniture import staging

## 2026-09-08: Launcher discovery repair

User requested replacing editor furniture with UE/Fab assets. The owned pack is Next Level 3D's [Free Furniture Pack](https://www.fab.com/listings/baece383-bc75-4de8-971d-25110a169a36), 37 models, Standard License, advertised through UE 5.4. Acquisition was verified by “Saved in My Library”. Download subsequently completed: 195 files, about 633 MiB, Launcher ShaVerifyAllFiles passed at 2026-09-08 05:18 UTC with ProcessSuccess TRUE / ErrorCode OK.

The Launcher project picker remained empty even with Show all projects enabled. The existing UE5SmokeTest has an empty EngineAssociation; the current Launcher GameUserSettings.ini had no CreatedProjectPaths. Neither a missing download nor version filtering alone explains this state.

Created the isolated `OpaiFurnitureImport/OpaiFurnitureImport.uproject` with EngineAssociation 5.8 (installed engine folder verified). The old smoke-test project is untouched. Registered this parent directory in `[Launcher] CreatedProjectPaths` in the active macOS `Application Support/Epic/EpicGamesLauncher/Saved/Config/MacEditor/GameUserSettings.ini`. A same-directory `.opai-before-project-discovery-20260908` backup preserves the original config; it contains private settings and must not be copied into this repository. The Launcher was normally quit through its application menu before editing, then reopened; the added setting persisted.

Native coordinates failed with `noWindowsAvailable`, despite readable screenshots and working menu AX actions. The user completed the Launcher download after project discovery was repaired. Successful installation into this exact project and native UE export now verify the path end to end; another engine installation was unnecessary.

Keep acquired source Content, engine-generated folders, and licensed GLB binaries out of public Git. Canonical identifiers, dimensions, transforms and editing semantics are preserved by a presentation-only mapping. No website deployment has occurred.

## Local conversion and integration

`export_probe.py` verified one embedded-material export before the batch. `export_furniture.py` exports selected static meshes using UE's native GLTFExporter at 512px material bake size / JPEG 85, and exports the modern wardrobe's Blueprint actor with its sliding door assembled. Run with the installed UnrealEditor executable, the local `.uproject`, `-run=pythonscript -script=<absolute script path> -unattended -AllowCommandletRendering`. Do not use NullRHI for material baking. Source assets are never saved or modified.

`node design-lab/ue-furniture-import/prepare_web.mjs` converts those private staging outputs to unit bounds and creates local `app/public/assets/models/fab/*.glb`. `web-manifest.json` records sources, byte sizes and orientations. The bridge applies canonical dimensions as asset scale, not object scale, retaining rule geometry and commands. Sofa requires -90 degrees around Y: the opposite sign faces it away from the TV. Wardrobe must use the assembled export, not the open static cabinet alone.

Eight mapped categories: sofa, dining table, dining chair (also study chair instances), coffee table, lounge chair, double bed, wardrobe, desk. About 2.84 MB combined. Other original models remain deliberately unchanged: the pack has no suitable kitchen system, wall shelf, single daybed or media console matching their functions. Do not represent this as a complete furniture-library replacement. The modern armchair was rejected after visual inspection; the elegant chair is used instead. Material changes tint existing textures per instance; reverting to the authored default restores original materials. Atlas-based assets do not yet offer separate upholstery/frame editing.

Validation: 316 Node tests passed and Vite production build passed (existing large-chunk advisory remains). Desktop room navigation and all eight GLB loads passed without page errors. Production preview at localhost:5181 measured 7,221,464 resource bytes on desktop and 7,111,860 on mobile after entering real-time 3D, both below 10 MB; no horizontal overflow. Mobile canvas measured 334 x 516px. These are local cold-context resource payload measurements, not public-network speed claims. See temporary `/tmp/opai-editor-fab-living.png` and `/tmp/opai-editor-fab-bedroom.png` for local evidence; these screenshots are not durable source assets. Licensed build inputs must be regenerated from the owned download before building a fresh checkout; do not upload the source pack or standalone converted models to the public repository.

Licence boundary: the visible Fab terms prohibit standalone redistribution and third-party incorporation through exported works. NoAI assets must not enter generative training/data pipelines. Verify the application's export behaviour before publishing any converted asset; entitlement alone is not a complete usage audit.

Owning Vault project: `PRJ-2026-008-oppein-ai-home-consensus`. Its project home has pre-existing uncommitted changes, so Vault synchronization remains blocked pending the user's overwrite/branch choice. This local record preserves the troubleshooting outcome without overwriting those notes.
