import meshio
import numpy as np
import json

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("tet_mesh", help=".mesh file")
parser.add_argument("surface_mesh", help=".stl file")
parser.add_argument("-o", "--output", help="Output file", required=True)
parser.add_argument(
    "-s",
    "--scale",
    type=float,
    default=1.0,
    help="Scale factor for output points, e.g. 0.001 to scale mm to meters"
)

args = parser.parse_args()


tet_mesh = meshio.read(args.tet_mesh)
points = tet_mesh.points.astype(float) * args.scale
tets = None

for cell in tet_mesh.cells:
    if cell.type == "tetra":
        tets = cell.data.astype(int)

if tets is None:
    raise RuntimeError("Invalid input, no tetrahedra found!")


data = {
    "points": points.reshape(-1).tolist(),
    "tets": tets.reshape(-1).tolist()
}


with open(args.output, "w") as f:
    json.dump(data, f)