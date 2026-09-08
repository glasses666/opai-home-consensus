"""Smooth ink withdrawal and real 120fps rendering; preserve approved V20."""
import bpy,json,sys
from pathlib import Path
BASE=Path(__file__).resolve().parent;OUT=BASE/'motion-v22';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v20/opai-settle-exit-v20.blend'))
s=bpy.context.scene;m=json.loads((BASE/'motion-v20/manifest.json').read_text())
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:
                        k.co.x=1+(k.co.x-1)*6
                        k.handle_left.x=1+(k.handle_left.x-1)*6
                        k.handle_right.x=1+(k.handle_right.x-1)*6
                    fc.update()
for marker in s.timeline_markers:marker.frame=1+(marker.frame-1)*6
def ease(x):
    x=max(0,min(1,x));return x*x*x*(10-15*x+6*x*x)
ink=[]
for i,d in enumerate(m['pen_strokes']):
    o=s.objects['V06 · ink %02d %s'%(i,d['name'])]
    o.animation_data_clear();o.data.animation_data_clear()
    close=max(7.35+i*.025,d['end']+.2)
    finish=16.8+i*.025
    for f in range(1,2305):
        t=(f-1)/120
        first=ease((t-d['start'])/.16)*(1-ease((t-close)/.8))
        last=ease((t-14.3-i*.012)/.45)*(1-ease((t-finish)/.8))
        amount=max(first,last)
        o.data.bevel_factor_start=0;o.data.bevel_factor_end=amount;o.data.bevel_depth=.028
        o.data.keyframe_insert('bevel_factor_end',frame=f)
        o.hide_render=o.hide_viewport=amount<.000001
        o.keyframe_insert('hide_render',frame=f);o.keyframe_insert('hide_viewport',frame=f)
    ink.append((o,close))
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path.startswith('hide_') else 'LINEAR'
s.render.fps=120;s.frame_end=2304
for o,close in ink:
    s.frame_set(round((close+.4)*120)+1)
    assert .35<o.data.bevel_factor_end<.65 and not o.hide_render
s.frame_set(2280);assert all(o.hide_render for o,_ in ink)
s.render.engine='CYCLES';prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='METAL';prefs.get_devices()
assert any(d.type=='METAL' for d in prefs.devices)
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=32;s.cycles.use_denoising=True
s.cycles.use_adaptive_sampling=True;s.cycles.adaptive_threshold=.06
s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100
s.render.threads_mode='FIXED';s.render.threads=14
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-smooth-ink-120fps-v22.blend'))
m.update(frames=2304,fps=120,seconds=19.2,ink_exit='800ms quintic reverse drawing, no hard 8s visibility cut',rendered=False)
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(OUT/'verification.json').write_text(json.dumps(dict(passed=True,all_ink_has_visible_half_retraction=True,all_ink_hidden_at_end=True,metal_device_present=True)))
if '--test' in sys.argv:
    for t in [7.8,8.2,8.6]:
        s.frame_set(round(t*120)+1);s.render.filepath=str(OUT/('check-%.1f.png'%t));bpy.ops.render.render(write_still=True)
else:
    frames=OUT/'frames';frames.mkdir(exist_ok=True)
    for f in range(1,2305):
        p=frames/('frame-%04d.png'%f)
        if p.exists() and p.stat().st_size>1000:continue
        s.frame_set(f);s.render.filepath=str(p);bpy.ops.render.render(write_still=True)
    (OUT/'complete.json').write_text(json.dumps(dict(frames=2304,fps=120,resolution=[1920,1080])))
