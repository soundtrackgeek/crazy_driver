"""Build every game asset headlessly.

    blender -b --factory-startup -P blender/build_all.py -- --out public/assets/models [--preview DIR] [--only NAME]

Each entry in ASSETS becomes <out>/<name>.glb.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cars import car_rally  # noqa: E402
from lib.export import export_glb, render_preview, reset_scene  # noqa: E402
from lib.mesh import vertex_color_material  # noqa: E402
from props import props  # noqa: E402

ASSETS = {
    "car_rally": car_rally.build,
    "props": props.build,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/assets/models")
    ap.add_argument("--preview", default=None, help="directory for PNG previews")
    ap.add_argument("--only", default=None)
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    for name, build in ASSETS.items():
        if args.only and name != args.only:
            continue
        reset_scene()
        objects = build(vertex_color_material())
        path = os.path.abspath(os.path.join(args.out, name + ".glb"))
        export_glb(path)
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects)
        print(f"[assets] {name}: {len(objects)} objects, {tris} tris -> {path}")
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            render_preview(os.path.abspath(os.path.join(args.preview, name + ".png")), objects)


if __name__ == "__main__":
    main()
