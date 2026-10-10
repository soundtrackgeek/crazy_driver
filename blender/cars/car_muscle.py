"""Muscle coupe: long bonnet, fastback roof, twin racing stripes (original design)."""

from lib import palette as P
from lib.mesh import MeshBuilder

from .common import build_wheel, greenhouse, lower_body


def build_body(mat):
    m = MeshBuilder()
    lower_body(
        m,
        [
            (-2.22, -0.24, 0.24, 0.88),
            (-2.10, -0.31, 0.34, 0.93),
            (-1.20, -0.31, 0.35, 0.94),  # rear haunches
            (1.70, -0.31, 0.30, 0.92),
            (2.18, -0.27, 0.22, 0.90),
            (2.28, -0.18, 0.12, 0.86),
        ],
    )
    # Fastback: long sloping rear glass from the tail up to the roof.
    greenhouse(
        m,
        [
            (-1.75, 0.33, 0.40, 0.86, 0.74),
            (-0.55, 0.34, 0.76, 0.86, 0.66),
            (0.30, 0.34, 0.78, 0.87, 0.66),
            (1.00, 0.30, 0.32, 0.89, 0.82),
        ],
    )

    # Twin racing stripes over bonnet, roof and boot.
    for sx in (-1, 1):
        x = sx * 0.17
        m.box((x, 0.345, 1.35), (0.2, 0.02, 1.7), P.PAINT2)
        m.box((x, 0.785, -0.12), (0.2, 0.02, 0.85), P.PAINT2)
        m.box((x, 0.355, -1.95), (0.2, 0.02, 0.4), P.PAINT2)

    # Bonnet scoop, chrome bumpers, grille, round-ish lights.
    m.box((0, 0.4, 1.1), (0.5, 0.12, 0.7), P.DARK)
    m.box((0, 0.42, 1.46), (0.42, 0.08, 0.04), P.BLACK)
    m.box((0, -0.22, 2.3), (1.72, 0.14, 0.12), P.LIGHT_GREY)
    m.box((0, -0.2, -2.25), (1.72, 0.14, 0.1), P.LIGHT_GREY)
    m.box((0, 0.02, 2.25), (1.2, 0.18, 0.06), P.BLACK)
    for sx in (-1, 1):
        m.box((sx * 0.68, 0.03, 2.24), (0.22, 0.2, 0.07), P.HEADLIGHT)
        m.box((sx * 0.55, 0.1, -2.23), (0.6, 0.12, 0.05), P.TAILLIGHT)
        m.box((sx * 0.92, 0.42, 0.75), (0.12, 0.08, 0.12), P.LIGHT_GREY)  # mirrors
        m.box((sx * 0.6, -0.36, -2.2), (0.1, 0.1, 0.25), P.GREY)  # exhausts
        m.box((sx * 0.94, 0.0, 0.2), (0.02, 0.08, 2.6), P.PAINT2)  # side stripe

    # Ducktail spoiler.
    m.box((0, 0.42, -2.12), (1.6, 0.08, 0.24), P.PAINT)
    return m.to_object("car_muscle_body", mat)


def build(mat):
    return [build_body(mat), build_wheel("car_muscle_wheel", mat, 0.35, 0.32, rim=P.LIGHT_GREY, spokes=True)]
