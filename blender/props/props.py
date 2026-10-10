"""Roadside prop kit. Origin = base centre on the ground; +Z = the side that faces the road."""

import random

from lib import palette as P
from lib.mesh import MeshBuilder


def tree_pine(mat):
    m = MeshBuilder()
    m.box((0, 0.6, 0), (0.35, 1.2, 0.35), P.TRUNK)
    for i, (y, r, h) in enumerate([(0.8, 2.0, 2.4), (2.2, 1.6, 2.2), (3.5, 1.1, 2.2)]):
        m.frustum_y((0, y, 0), r, 0.0, h, 6, P.PINE[i], cap=P.PINE[0], phase=i * 0.5)
    return m.to_object("tree_pine", mat)


def tree_broadleaf(mat):
    m = MeshBuilder()
    m.frustum_y((0, 0, 0), 0.28, 0.2, 2.2, 5, P.TRUNK)
    m.blob((0, 1.6, 0), 2.0, 3.4, P.LEAF, seed=3, segments=7, flat_bottom=False)
    return m.to_object("tree_broadleaf", mat)


def bush(mat):
    m = MeshBuilder()
    m.blob((0, 0, 0), 1.0, 1.1, [P.BUSH, P.LEAF[0]], seed=7, segments=6)
    return m.to_object("bush", mat)


def rock(mat):
    m = MeshBuilder()
    m.blob((0, -0.2, 0), 1.3, 1.5, P.ROCK, seed=11, segments=6, jitter=0.25)
    return m.to_object("rock", mat)


def tyre_stack(mat):
    m = MeshBuilder()
    for i in range(3):
        y = i * 0.26
        m.frustum_y((0, y, 0), 0.36, 0.36, 0.25, 8, P.BLACK, cap=P.BLACK)
    m.frustum_y((0, 0.78, 0), 0.2, 0.2, 0.02, 8, P.WHITE)
    return m.to_object("tyre_stack", mat)


def cone(mat):
    m = MeshBuilder()
    m.box((0, 0.025, 0), (0.42, 0.05, 0.42), P.ORANGE)
    m.frustum_y((0, 0.05, 0), 0.17, 0.11, 0.2, 6, P.ORANGE)
    m.frustum_y((0, 0.25, 0), 0.11, 0.08, 0.1, 6, P.WHITE)
    m.frustum_y((0, 0.35, 0), 0.08, 0.0, 0.25, 6, P.ORANGE)
    return m.to_object("cone", mat)


def chevron_sign(mat):
    """Corner warning board. The +Z face looks at the driver, whose right is +X, so the
    arrows point +X (a right-hand bend). The game mirrors it for left bends."""
    m = MeshBuilder()
    for sx in (-1, 1):
        m.box((sx * 1.0, 0.8, 0), (0.12, 1.6, 0.12), P.GREY)
    m.box((0, 1.9, 0), (2.6, 0.9, 0.08), P.BLACK)
    # Three chevron prisms on the +Z face.
    for i in range(3):
        x = -0.85 + i * 0.65
        tip = x + 0.35
        outline = [(x, 2.25), (tip, 1.9), (x, 1.55), (x - 0.22, 1.55), (tip - 0.22, 1.9), (x - 0.22, 2.25)]
        m.loft([[(px, py, z) for px, py in outline] for z in (0.03, 0.07)], P.YELLOW, cap_start=P.YELLOW, cap_end=P.YELLOW)
    return m.to_object("chevron_sign", mat)


def lamp_post(mat):
    m = MeshBuilder()
    m.frustum_y((0, 0, 0), 0.12, 0.08, 6.0, 6, P.GREY)
    m.box((0, 5.95, 0.6), (0.1, 0.1, 1.3), P.GREY)
    m.box((0, 5.85, 1.2), (0.3, 0.12, 0.5), P.HEADLIGHT, top=P.GREY)
    return m.to_object("lamp_post", mat)


def grandstand(mat):
    """12 m stand, seats rising away from the road (+Z faces the track)."""
    m = MeshBuilder()
    rnd = random.Random(5)
    steps = 5
    for i in range(steps):
        depth_z = -i * 1.0
        h = 0.6 + i * 0.6
        m.box((0, h / 2, depth_z), (12, h, 1.0), P.LIGHT_GREY, top=P.GREY)
        # Crowd: a row of little blocky spectators on each step.
        for k in range(16):
            x = -5.6 + k * 0.75 + rnd.uniform(-0.1, 0.1)
            m.box((x, h + 0.3, depth_z - 0.1), (0.42, 0.6, 0.35), rnd.choice(P.CROWD), top=0x3A2A1A)
    for sx in (-1, 1):
        m.box((sx * 6.1, 2.6, -2.0), (0.2, 5.2, 5.2), P.GREY)
    for sx in (-6, 0, 6):
        m.box((sx, 3.6, -4.4), (0.2, 7.2, 0.2), P.GREY)
    m.box((0, 7.3, -2.2), (12.6, 0.2, 5.4), P.RED)
    return m.to_object("grandstand", mat)


def house(mat):
    m = MeshBuilder()
    w, d, h = 6.0, 5.0, 3.0
    m.box((0, h / 2, 0), (w, h, d), P.WALL_PLASTER)
    # Pitched roof as a prism.
    hw, hd, top = w / 2 + 0.3, d / 2 + 0.3, h + 2.0
    a = [(-hw, h, -hd), (hw, h, -hd), (0, top, -hd)]
    b = [(-hw, h, hd), (hw, h, hd), (0, top, hd)]
    m.loft([a, b], P.ROOF_TILE, cap_start=P.ROOF_TILE, cap_end=P.ROOF_TILE)
    m.box((0.8, 1.0, d / 2 + 0.02), (0.9, 2.0, 0.05), P.WOOD)
    for x in (-1.6, 2.3):
        m.box((x, 1.8, d / 2 + 0.02), (1.0, 0.9, 0.05), P.GLASS)
    m.box((1.8, h + 1.6, 0.8), (0.5, 1.4, 0.5), P.GREY)  # chimney
    return m.to_object("house", mat)


def billboard(mat):
    m = MeshBuilder()
    for sx in (-2.2, 2.2):
        m.box((sx, 1.6, 0), (0.2, 3.2, 0.2), P.GREY)
    m.box((0, 4.0, 0), (6.4, 2.6, 0.15), P.WHITE)
    # Bold blocky "advert" panels on the road side.
    m.box((-1.6, 4.0, 0.09), (2.8, 2.2, 0.02), P.RED)
    m.box((1.5, 4.5, 0.09), (2.9, 1.0, 0.02), P.BLUE)
    m.box((1.5, 3.4, 0.09), (2.9, 0.7, 0.02), P.YELLOW)
    return m.to_object("billboard", mat)


ALL = [tree_pine, tree_broadleaf, bush, rock, tyre_stack, cone, chevron_sign, lamp_post, grandstand, house, billboard]


def build(mat):
    return [fn(mat) for fn in ALL]
