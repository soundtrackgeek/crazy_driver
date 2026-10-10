"""Rally hatchback in the spirit of mid-90s rally games (original design).

Origin = vehicle centre of mass, +Z forward, +Y up. Wheels are exported as a
separate "car_rally_wheel" object (rim facing +X) that the game instances four times.
Body bottom sits at y=-0.33; suspension anchors in the game are at y=-0.1.
"""

from lib import palette as P
from lib.mesh import MeshBuilder

from .common import build_wheel, greenhouse, lower_body


def build_body(mat):
    m = MeshBuilder()
    lower_body(
        m,
        [
            (-2.05, -0.27, 0.18, 0.84),
            (-1.95, -0.33, 0.31, 0.88),
            (1.50, -0.33, 0.27, 0.88),
            (1.93, -0.30, 0.15, 0.86),
            (2.08, -0.22, 0.06, 0.80),
        ],
    )
    greenhouse(
        m,
        [
            (-1.82, 0.29, 0.40, 0.84, 0.68),
            (-1.38, 0.30, 0.84, 0.84, 0.64),
            (0.32, 0.30, 0.88, 0.85, 0.66),
            (1.08, 0.26, 0.30, 0.86, 0.80),
        ],
    )

    # Roof livery stripe (secondary colour).
    m.box((0, 0.885, -0.5), (0.5, 0.02, 1.6), P.PAINT2)

    # Bumpers, grille and lights.
    m.box((0, -0.24, 2.08), (1.62, 0.16, 0.14), P.DARK)
    m.box((0, -0.24, -2.07), (1.62, 0.16, 0.12), P.DARK)
    m.box((0, -0.02, 2.06), (0.5, 0.12, 0.06), P.BLACK)
    for sx in (-1, 1):
        m.box((sx * 0.55, 0.0, 2.02), (0.36, 0.13, 0.08), P.HEADLIGHT)
        m.box((sx * 0.6, 0.05, -2.06), (0.34, 0.12, 0.05), P.TAILLIGHT)
        m.box((sx * 0.45, -0.22, 2.16), (0.16, 0.08, 0.04), P.HEADLIGHT)  # fog lamps

    # Side stripe and door number panel.
    for sx in (-1, 1):
        m.box((sx * 0.885, 0.0, -0.2), (0.02, 0.1, 3.2), P.PAINT2)
        m.box((sx * 0.89, 0.13, 0.15), (0.02, 0.26, 0.42), P.WHITE)
        m.box((sx * 0.9, 0.36, 0.9), (0.14, 0.09, 0.14), P.PAINT)  # mirrors
        m.box((sx * 0.75, -0.45, -1.62), (0.3, 0.24, 0.03), P.PAINT2)  # mud flaps

    # Rear wing on the roof edge.
    for sx in (-1, 1):
        m.box((sx * 0.5, 0.84, -1.5), (0.06, 0.26, 0.1), P.BLACK)
    m.box((0, 0.96, -1.52), (1.38, 0.05, 0.32), P.PAINT2)

    # Bonnet lamp pod — very rally.
    m.box((0, 0.3, 1.62), (0.9, 0.06, 0.12), P.BLACK)
    for x in (-0.33, -0.11, 0.11, 0.33):
        m.box((x, 0.36, 1.66), (0.16, 0.12, 0.06), P.HEADLIGHT)

    return m.to_object("car_rally_body", mat)


def build(mat):
    return [build_body(mat), build_wheel("car_rally_wheel", mat, 0.33, 0.26)]
