# Three homepage roomlets — 2026-09-06

## Completed
- Living-room media retained unchanged. Children’s room and corrected bedroom now occupy homepage story tabs 2 and 3.
- Sources: `roomlet-growing-local/` copied from the supplied two-stories bundle; `roomlet-together-local/` retains the locally corrected wardrobe layouts and animation.
- Reproducible offline capture: `capture-roomlet-stories.py growing` / `together` with Pillow and Playwright. The existing browser renderer, accepted lighting and framing are retained, with built-in drift disabled and a smooth ±2° camera-yaw loop applied once.
- New outputs: 960×960, 60 fps, 864 frames / 14.4 s, source motion at 1.25×. H264 sRGB transfer is written into both VUI and container metadata. Background is #353d32, matching the homepage; JPEG posters provide fallback.
- Tab changes remount only the corresponding media. Playback retains offscreen, hidden-document and reduced-motion handling.

## Verification and lessons
- Children’s scene validator passed: 4321 samples, 43210 pairs, zero issues; three GLB payload/static-import checks passed. This is sampled validation, not continuous collision or construction proof.
- Production build passed with existing bundle-size / externalized-module warnings.
- ffprobe confirmed both outputs at 60 fps / 14.4 seconds and sRGB transfer; approximately 1.9 MB each.
- Actual in-app browser tab switching and animated layout changes inspected. Background visually matches. Cross-browser/device coverage remains unverified.
- Initial media and article sibling keys collided, retaining an old figure after switching. Prefix media keys (`media-N`) to keep sibling identity unique; corrected and retested after reload.

## Persistence boundary

### Homepage intro duration
- Follow-up: hero video autoplay removed; loading-state transitions pause/reset it to zero, then start it only after the intro exits. Replay follows the same sequence. Intro video time >=3 seconds reveals “正在加载” at horizontal center / 63.7% viewport height, with 1.1-second fade-in and slow 2.6-second opacity breathing. The existing >=8-second exit and page fade remain. Build passed; exact browser timing not instrumented.
- Automatic exit now requires video playback time >=8 seconds and hero readiness (previously 3.35 seconds). Safety timeout raised from 6.5 to 15 seconds so it cannot cut normal playback short. Manual skip, reduced-motion bypass and video-error fallback remain available; homepage fade-in is unchanged. Production build and whitespace check passed.
Local only; no commit, push or deployment. Original source bundles remain untouched. AgentVault owning project home was consulted, but its home and visual-reference notes already contain uncommitted changes. They were not overwritten; this source-side record preserves the verified result pending an explicit conflict resolution choice.

## Bedroom bedside correction
- User requested the bedside table and attached lamp stay grounded instead of flying upward. Removed its flight track; it now slides 0.06 model metres alongside the bed at source seconds 6.05–6.85, with the existing smooth easing and reversed return.
- Rebuilt scene data, GLBs, standalone preview and homepage video. Other scenes, camera, duration and lighting unchanged. Media cache version advanced to `home-2-grounded`.
- All 1081 bedside samples have identical Y=0.08; full sampled collision validator reports zero issues and all three GLB checks pass. Homepage playback visually inspected.
- Lesson: do not apply the small-object flight convention to a grounded bedside furniture assembly merely because it includes a lamp.
