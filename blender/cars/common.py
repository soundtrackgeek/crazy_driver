"""Shared helpers for car models (game space: origin = centre of mass, +Z forward, +Y up)."""

import math

from lib import palette as P
from lib.mesh import MeshBuilder


def ring8(hw, yb, yt):
    """Chamfered body cross-section, counter-clockwise seen from the front."""
    return [
        (hw * 0.92, yb),
        (hw, yb + 0.12),
        (hw, yt - 0.06),
        (hw * 0.94, yt),
        (-hw * 0.94, yt),
        (-hw, yt - 0.06),
        (-hw, yb + 0.12),
        (-hw * 0.92, yb),
    ]


def lower_body(m, stations):
    """Main body loft. stations: (z, y_bottom, y_top, half_width). Bottom dark, rest paint."""
    rings = [[(x, y, z) for x, y in ring8(hw, yb, yt)] for z, yb, yt, hw in stations]
    m.loft(rings, lambda i, j: P.DARK if j == 7 else P.PAINT, cap_start=P.DARK, cap_end=P.DARK)


def greenhouse(m, stations, roof_segment=1):
    """Cabin loft. stations: (z, y_base, y_top, half_width_base, half_width_top), rear to front.
    Segment `roof_segment` is the roof with side windows; others are glass slopes with paint pillars."""
    rings = [[(hb, yb, z), (ht, yt, z), (-ht, yt, z), (-hb, yb, z)] for z, yb, yt, hb, ht in stations]

    def color(i, j):
        if j == 3:
            return P.DARK  # hidden underside
        if j == 1:
            return P.PAINT if i == roof_segment else P.GLASS
        return P.GLASS if i == roof_segment else P.PAINT

    m.loft(rings, color, cap_start=P.PAINT, cap_end=P.PAINT)


def build_wheel(name, mat, radius, width, rim=P.LIGHT_GREY, spokes=False):
    m = MeshBuilder()
    m.cylinder_x((0, 0, 0), radius, width, 8, P.BLACK, P.BLACK, P.BLACK)
    rim_x = width / 2 + 0.005
    m.cylinder_x((rim_x, 0, 0), radius * 0.64, 0.02, 8, rim, rim, rim)
    if spokes:
        for k in range(5):
            a = k * 2 * math.pi / 5
            m.box((rim_x + 0.015, math.cos(a) * radius * 0.32, math.sin(a) * radius * 0.32), (0.02, 0.06, 0.06), P.DARK)
    m.cylinder_x((rim_x + 0.015, 0, 0), radius * 0.2, 0.03, 6, P.DARK, P.DARK, P.DARK)
    return m.to_object(name, mat)
