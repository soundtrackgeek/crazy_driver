"""Scene reset, glTF export and Workbench preview renders."""

import math

import bpy
from mathutils import Vector


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export_glb(path):
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
    except TypeError:  # older Blender without the option
        bpy.ops.export_scene.gltf(**kwargs)


def render_preview(path, objects, spacing=None):
    """Lay objects out in a row (preview only — call after export) and render with Workbench."""
    scene = bpy.context.scene
    if spacing is None:
        spacing = max(max(o.dimensions.x, o.dimensions.y) for o in objects) * 1.25
    cols = max(1, math.ceil(math.sqrt(len(objects))))
    for i, o in enumerate(objects):
        o.location = Vector(((i % cols) * spacing, (i // cols) * spacing, 0))
    bpy.context.view_layer.update()

    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = (lo + hi) / 2
    size = (hi - lo).length

    cam_data = bpy.data.cameras.new("preview")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = size * 1.05
    cam = bpy.data.objects.new("preview", cam_data)
    scene.collection.objects.link(cam)
    # Three-quarter view from the front-left, above (game +Z forward = Blender -Y).
    direction = Vector((1.0, -1.3, 0.9)).normalized()
    cam.location = center + direction * size * 2
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "VERTEX"
    shading.show_cavity = False
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.film_transparent = False
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
