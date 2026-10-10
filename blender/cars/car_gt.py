"""Mid-engine wedge GT supercar (original design)."""

from lib import palette as P
from lib.mesh import MeshBuilder

from .common import build_wheel, greenhouse, lower_body


def build_body(mat):
    m = MeshBuilder()
    # Wedge: tall wide rear, nose dropping almost to the road.
    lower_body(
        m,
        [
            (-2.15, -0.20, 0.30, 0.94),
            (-2.02, -0.29, 0.38, 0.99),
            (-0.60, -0.29, 0.36, 0.99),
            (1.20, -0.29, 0.20, 0.96),
            (2.05, -0.26, 0.04, 0.90),
            (2.22, -0.20, -0.02, 0.82),
        ],
    )
    # Small cab-forward canopy.
    greenhouse(
        m,
        [
            (-1.30, 0.34, 0.44, 0.84, 0.62),
            (-0.72, 0.35, 0.70, 0.84, 0.58),
            (0.15, 0.32, 0.72, 0.86, 0.60),
            (1.05, 0.18, 0.22, 0.90, 0.80),
        ],
    )

    # Engine-cover louvres behind the cabin.
    for k in range(5):
        m.box((0, 0.395, -1.45 - k * 0.12), (1.0, 0.02, 0.05), P.BLACK)
    # Side intakes and sill stripe.
    for sx in (-1, 1):
        m.box((sx * 0.995, 0.12, -0.75), (0.02, 0.22, 0.65), P.BLACK)
        m.box((sx * 0.99, -0.12, 0.3), (0.02, 0.06, 3.0), P.PAINT2)
        m.box((sx * 0.9, 0.4, 0.75), (0.12, 0.07, 0.12), P.PAINT)  # mirrors
    # Pop-up headlight covers (closed), front splitter, taillight bar.
    for sx in (-1, 1):
        m.box((sx * 0.55, 0.13, 1.45), (0.4, 0.03, 0.3), P.BLACK)
        m.box((sx * 0.55, -0.05, 2.12), (0.3, 0.06, 0.06), P.HEADLIGHT)
    m.box((0, -0.27, 2.2), (1.7, 0.05, 0.25), P.BLACK)
    m.box((0, 0.2, -2.16), (1.7, 0.1, 0.05), P.TAILLIGHT)
    m.box((0, -0.1, -2.16), (1.2, 0.14, 0.05), P.BLACK)

    # Big rear wing on two pylons.
    for sx in (-1, 1):
        m.box((sx * 0.6, 0.55, -1.95), (0.06, 0.32, 0.18), P.BLACK)
    m.box((0, 0.73, -2.0), (1.9, 0.06, 0.38), P.PAINT2)
    for sx in (-1, 1):
        m.box((sx * 0.96, 0.66, -2.0), (0.03, 0.2, 0.42), P.PAINT2)  # end plates
    return m.to_object("car_gt_body", mat)


def build(mat):
    return [build_body(mat), build_wheel("car_gt_wheel", mat, 0.33, 0.32, rim=P.GREY, spokes=True)]
