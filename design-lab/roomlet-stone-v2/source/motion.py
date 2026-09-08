"""ROOMLET 02: deterministic, reversible, collision-checked choreography.

This is the single source of truth for both the webpage and the GLB animation.
All positions are metres, +Y up. No fades, invisible teleports, or zero scaling.
"""
from __future__ import annotations
import math
import numpy as np

DURATION = 16.4
FPS = 60
GROUND = 0.08
P = math.pi
LAYOUTS = {
    'original': {
        'Furniture_Sofa': {'position': [-.47, GROUND, -1.13], 'rotationY': 0},
        'Furniture_DiningTable': {'position': [.25, GROUND, .60], 'rotationY': 0},
        'Furniture_DiningChair_01': {'position': [-.96, GROUND, .60], 'rotationY': P / 2},
        'Furniture_DiningChair_02': {'position': [1.43, GROUND, .60], 'rotationY': -P / 2},
        'Furniture_FloorLamp': {'position': [-1.78, GROUND, .19], 'rotationY': 0},
        'Furniture_Plant': {'position': [1.64, GROUND, -1.23], 'rotationY': 0},
    },
    'modified': {
        'Furniture_Sofa': {'position': [-1.54, GROUND, -.06], 'rotationY': P / 2},
        'Furniture_DiningTable': {'position': [.72, GROUND, -.14], 'rotationY': P / 2},
        'Furniture_DiningChair_01': {'position': [.70, GROUND, -1.27], 'rotationY': 0},
        'Furniture_DiningChair_02': {'position': [.73, GROUND, 1.12], 'rotationY': -P},
        'Furniture_FloorLamp': {'position': [-1.67, GROUND, 1.49], 'rotationY': 0},
        'Furniture_Plant': {'position': [1.70, GROUND, .96], 'rotationY': -.48},
    },
}
SMALL = ['Furniture_DiningChair_01', 'Furniture_DiningChair_02', 'Furniture_FloorLamp', 'Furniture_Plant']
BIG = ['Furniture_Sofa', 'Furniture_DiningTable']

def ease(t: float, a: float, b: float) -> float:
    u = min(1., max(0., (t-a)/(b-a)))
    return u*u*u*(u*(u*6-15)+10)

def mix(a, b, u):
    return np.asarray(a, float)*(1-u)+np.asarray(b, float)*u

def sample_forward(name: str, t: float):
    a, b = LAYOUTS['original'][name], LAYOUTS['modified'][name]
    pos = np.asarray(a['position'], float).copy()
    yaw = a['rotationY']
    if name in SMALL:
        i = SMALL.index(name)
        # Clear the default camera's upper frame before any lateral relocation.
        # Keep staggered heights and original easing/timing; no visible hovering.
        altitude = [10.0, 10.3, 10.0, 10.2][i]
        up = ease(t, .85 + i*.12, 1.74+i*.12)
        travel = ease(t, 2.80+i*.08, 5.02+i*.08)
        down = ease(t, 5.95+i*.09, 6.82+i*.09)
        pos = mix(a['position'], b['position'], travel)
        # Positive-only lift. No furniture base ever sinks into the floor.
        pos[1] = GROUND+(altitude-GROUND)*up*(1-down)
        if 0 < travel < 1:
            pos[1] += .055*math.sin(math.pi*travel)**2
        yaw = float(mix(a['rotationY'], b['rotationY'], travel))
    elif name == 'Furniture_DiningTable':
        park = [1.32, GROUND, 1.16]
        if t < 2.75:
            pos = mix(a['position'], park, ease(t, 2.08, 2.74))
        else:
            u = ease(t, 5.0, 5.90)
            pos = mix(park, b['position'], u)
            yaw = float(mix(a['rotationY'], b['rotationY'], u))
    elif name == 'Furniture_Sofa':
        middle = [-.35, GROUND, -.10]
        if t < 3.50:
            pos = mix(a['position'], middle, ease(t, 2.78, 3.50))
        else:
            pos = mix(middle, b['position'], ease(t, 4.30, 4.95))
            yaw = float(mix(a['rotationY'], b['rotationY'], ease(t, 3.50, 4.30)))
    return pos, np.array([0, math.sin(yaw/2), 0, math.cos(yaw/2)])

def sample(name: str, time: float):
    t = min(max(float(time), 0.), DURATION)
    if t > DURATION/2:
        t = DURATION-t
    return sample_forward(name, t)

def create_motion():
    times = np.linspace(0, DURATION, round(DURATION*FPS)+1)
    tracks = []
    for name in LAYOUTS['original']:
        samples = [sample(name, float(t)) for t in times]
        tracks.append({'name': name, 'positions': np.asarray([s[0] for s in samples], np.float32),
                       'rotations': np.asarray([s[1] for s in samples], np.float32)})
    return times.astype(np.float32), tracks
