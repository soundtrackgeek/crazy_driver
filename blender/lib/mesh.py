"""Tiny low-poly mesh builder.

All coordinates are given in GAME space (three.js: +Y up, +Z forward, car's
right = -X) and converted to Blender space (+Z up) here. The glTF exporter
converts back with export_yup, so the game receives exactly these numbers.
Every face gets a flat colour, stored as a per-corner byte colour attribute.
"""

import math
import random

import bmesh
import bpy

from .palette import rgba


def game_to_blender(x, y, z):
    return (x, -z, y)


class MeshBuilder:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.colors = []

    # --- primitives -------------------------------------------------------

    def v(self, x, y, z):
        self.verts.append(game_to_blender(x, y, z))
        return len(self.verts) - 1

    def face(self, idx, color):
        self.faces.append(tuple(idx))
        self.colors.append(rgba(color))

    def poly(self, pts, color):
        self.face([self.v(*p) for p in pts], color)

    def loft(self, rings, color, cap_start=None, cap_end=None):
        """Skin closed rings of equal length. `color` is a hex value or
        fn(station_index, side_index) -> hex."""
        idx = [[self.v(*p) for p in ring] for ring in rings]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n):
                a, b = idx[i][j], idx[i][(j + 1) % n]
                c, d = idx[i + 1][(j + 1) % n], idx[i + 1][j]
                col = color(i, j) if callable(color) else color
                self.face([a, b, c, d], col)
        if cap_start is not None:
            self.face(list(reversed(idx[0])), cap_start)
        if cap_end is not None:
            self.face(idx[-1], cap_end)

    def box(self, center, size, color, top=None):
        cx, cy, cz = center
        sx, sy, sz = (s / 2 for s in size)
        ring = lambda y: [(cx - sx, y, cz - sz), (cx + sx, y, cz - sz), (cx + sx, y, cz + sz), (cx - sx, y, cz + sz)]
        self.loft([ring(cy - sy), ring(cy + sy)], color, cap_start=color, cap_end=top if top is not None else color)

    def cylinder_x(self, center, radius, width, segments, side, cap_pos, cap_neg, phase=0.0):
        """Cylinder along the X axis (wheels)."""
        cx, cy, cz = center
        ring = lambda x: [
            (x, cy + radius * math.cos(phase + 2 * math.pi * k / segments), cz + radius * math.sin(phase + 2 * math.pi * k / segments))
            for k in range(segments)
        ]
        self.loft([ring(cx - width / 2), ring(cx + width / 2)], side, cap_start=cap_neg, cap_end=cap_pos)

    def frustum_y(self, base, r0, r1, height, segments, color, cap=None, phase=0.0):
        """Vertical cone/frustum standing on `base`. r1 may be ~0 for a point."""
        bx, by, bz = base
        ring = lambda r, y: [
            (bx + r * math.cos(phase + 2 * math.pi * k / segments), y, bz + r * math.sin(phase + 2 * math.pi * k / segments))
            for k in range(segments)
        ]
        r1 = max(r1, 0.01)
        self.loft([ring(r0, by), ring(r1, by + height)], color, cap_start=cap if cap is not None else color, cap_end=color)

    def blob(self, center, radius, height, color, seed=0, segments=7, jitter=0.18, flat_bottom=True):
        """Lumpy low-poly blob for rocks, bushes and tree crowns."""
        rnd = random.Random(seed)
        cx, cy, cz = center
        lats = [0.0, 0.35, 0.75, 1.0] if flat_bottom else [0.08, 0.35, 0.7, 0.95]
        rings = []
        for t in lats:
            r = radius * math.sin(math.pi * (0.5 + 0.5 * t)) if flat_bottom else radius * math.sin(math.pi * t)
            r = max(r, radius * 0.25)
            y = cy + height * t
            ring = []
            for k in range(segments):
                a = 2 * math.pi * k / segments + rnd.uniform(-0.15, 0.15)
                rr = r * (1 + rnd.uniform(-jitter, jitter))
                ring.append((cx + rr * math.cos(a), y + rnd.uniform(-jitter, jitter) * height * 0.3, cz + rr * math.sin(a)))
            rings.append(ring)
        cols = color if isinstance(color, list) else [color]
        self.loft(rings, lambda i, j: cols[(i + j) % len(cols)], cap_start=cols[0], cap_end=cols[-1])

    # --- output -----------------------------------------------------------

    def to_object(self, name, material):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        me.validate(clean_customdata=False)
        me.update()

        # Make normals point outwards on every closed part (face order is preserved).
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()

        attr = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        for poly in me.polygons:
            col = self.colors[poly.index]
            for li in poly.loop_indices:
                attr.data[li].color_srgb = col
        me.color_attributes.active_color = attr
        me.materials.append(material)

        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def vertex_color_material():
    """Single shared material that shows the 'Col' attribute (the game swaps in Lambert)."""
    mat = bpy.data.materials.get("vc")
    if mat:
        return mat
    mat = bpy.data.materials.new("vc")
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat
