"""
Builds the Cessna 172S cabin (cockpit, panel, interior, pilot) in Blender and
exports it for the flight sim.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build_cabin.py -- [--render DIR]

Outputs
  blender/c172-cabin.blend      editable source: open it, tweak, re-export
  public/models/c172-cabin.glb  what the sim loads

Coordinates: everything below is written in the sim's body frame (metres,
+x right, +y up, -z forward, origin at the centre of gravity) and converted
to Blender's z-up axes by `P()`. The glTF exporter converts back, so the GLB
lines up exactly with the exterior that the sim builds in code.

Parts the sim animates or draws on are separate objects with fixed names:
  gauge_<name>      instrument faces (UVs 0..1, drawn live by the sim)
  radios, annunciator
  yoke_left, yoke_right, throttle, mixture, flap_lever, trim_wheel,
  pedal_<seat>_<side>, pilot
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLEND_OUT = os.path.join(ROOT, "blender", "c172-cabin.blend")
GLB_OUT = os.path.join(ROOT, "public", "models", "c172-cabin.glb")

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
RENDER_DIR = argv[argv.index("--render") + 1] if "--render" in argv else None


def P(x, y, z):
    """Sim body coordinates -> Blender coordinates."""
    return Vector((x, -z, y))


# ---------------------------------------------------------------------------
# Scene and materials
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
export_col = bpy.data.collections.new("Cabin")
scene.collection.children.link(export_col)
helper_col = bpy.data.collections.new("Helpers (not exported)")
scene.collection.children.link(helper_col)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


MATERIALS = {}


def material(name, hex_color, roughness=0.8, metallic=0.0):
    if name in MATERIALS:
        return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    rgb = [srgb_to_linear(((hex_color >> s) & 255) / 255) for s in (16, 8, 0)]
    mat.diffuse_color = (*rgb, 1.0)
    if mat.node_tree is None:
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    MATERIALS[name] = mat
    return mat


# Palette taken from the reference photos: tan interior, mid-grey panel,
# black padded glareshield, black instrument faces.
M = {
    "headliner": material("headliner", 0xe2d6c0, 0.95),
    "trim": material("trim_tan", 0xc9b28c, 0.9),
    "wall": material("wall_tan", 0xceba96, 0.95),
    "wall_low": material("wall_low", 0x9c8a6c, 0.95),
    "frame": material("window_frame", 0xbfa77f, 0.9),
    "panel": material("panel_grey", 0x5e6166, 0.7),
    "panel_edge": material("panel_edge", 0x4a4d52, 0.7),
    "glare": material("glareshield", 0x1c1e22, 0.85),
    "bezel": material("bezel_black", 0x0f1012, 0.5),
    "dial": material("dial_black", 0x070707, 0.6),
    "placard": material("placard", 0xe6e3da, 0.6),
    "switch_red": material("switch_red", 0xb83227, 0.5),
    "switch_white": material("switch_white", 0xe8e6e0, 0.5),
    "chrome": material("chrome", 0xc9ccd0, 0.25, 1.0),
    "steel": material("steel", 0x8e9298, 0.4, 0.8),
    "knob_black": material("knob_black", 0x121212, 0.45),
    "knob_red": material("knob_red", 0xa82a20, 0.45),
    "yoke": material("yoke_black", 0x141414, 0.5),
    "yoke_plate": material("yoke_plate", 0xd6d2c8, 0.5),
    "carpet": material("carpet", 0x4a463f, 1.0),
    "leather": material("seat_leather", 0x8c7a62, 0.75),
    "leather_dark": material("seat_insert", 0x5f5346, 0.8),
    "belt": material("belt", 0x3c4048, 0.8),
    "rubber": material("rubber", 0x1d1e20, 0.9),
    "screen": material("screen_black", 0x050607, 0.3),
    "radio_face": material("radio_face", 0x1b1c1e, 0.6),
    "compass_card": material("compass_card", 0xe9e3c8, 0.6),
    "shirt": material("pilot_shirt", 0x34506e, 0.9),
    "skin": material("pilot_skin", 0xe0b394, 0.8),
    "hair": material("pilot_hair", 0x2d241c, 0.9),
    "headset": material("headset", 0x202124, 0.6),
    "pants": material("pilot_pants", 0x3a3d44, 0.9),
}


# ---------------------------------------------------------------------------
# Mesh building helpers
# ---------------------------------------------------------------------------


class Part:
    """Accumulates geometry for one object, with a material per face."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def _mat_index(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _tag(self, faces, mat):
        index = self._mat_index(mat)
        for f in faces:
            f.material_index = index

    def poly(self, points, mat):
        verts = [self.bm.verts.new(p) for p in points]
        face = self.bm.faces.new(verts)
        self._tag([face], mat)
        return face

    def loft(self, rings, mat, closed=True, caps=True, mat_fn=None):
        """Skins rings (lists of Blender-space points, equal length) into a tube."""
        vrings = [[self.bm.verts.new(p) for p in ring] for ring in rings]
        n = len(rings[0])
        faces = []
        for r in range(len(vrings) - 1):
            a, b = vrings[r], vrings[r + 1]
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                f = self.bm.faces.new([a[i], a[j], b[j], b[i]])
                self._tag([f], mat_fn(r, i) if mat_fn else mat)
                faces.append(f)
        if caps and closed:
            for ring in (vrings[0], vrings[-1]):
                f = self.bm.faces.new(ring)
                self._tag([f], mat_fn(-1, 0) if mat_fn else mat)
                faces.append(f)
        return faces

    def box(self, center, size, mat, rotation=None):
        """Axis-aligned box in sim coordinates (center, size are sim xyz)."""
        sx, sy, sz = size
        m = Matrix.Translation(P(*center))
        if rotation is not None:
            m = m @ rotation
        m = m @ Matrix.Diagonal((sx, sz, sy, 1.0))
        result = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._tag({f for v in result["verts"] for f in v.link_faces}, mat)

    def cylinder(self, a, b, radius, mat, sides=12, radius_b=None):
        """A capped cylinder between two sim points."""
        pa, pb = P(*a), P(*b)
        axis = pb - pa
        length = axis.length
        rot = axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m = Matrix.Translation((pa + pb) / 2) @ rot
        result = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            segments=sides,
            radius1=radius,
            radius2=radius if radius_b is None else radius_b,
            depth=length,
            matrix=m,
        )
        self._tag({f for v in result["verts"] for f in v.link_faces}, mat)

    def disc_facing_pilot(self, cx, cy, z, radius, mat, sides=32):
        """A flat disc in the panel plane (normal toward +z sim, i.e. the pilot)."""
        pts = [P(cx + math.cos(t) * radius, cy + math.sin(t) * radius, z) for t in (i / sides * math.tau for i in range(sides))]
        return self.poly(pts, mat)

    def finish(self, smooth_angle=None, modifiers=(), collection=None, recalc=True, origin=None):
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.mats:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        (collection or export_col).objects.link(obj)
        if smooth_angle is not None:
            for p in mesh.polygons:
                p.use_smooth = True
            mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
        for kind, settings in modifiers:
            mod = obj.modifiers.new(kind.title(), kind)
            for key, value in settings.items():
                setattr(mod, key, value)
        if origin is not None:
            # Move the object's origin (its pivot when animated) without moving the geometry.
            o = P(*origin)
            mesh.transform(Matrix.Translation(-o))
            obj.location = o
        return obj


def bevel(width=0.004, segments=2, angle=40):
    return ("BEVEL", {"width": width, "segments": segments, "limit_method": "ANGLE", "angle_limit": math.radians(angle)})


def subsurf(levels=1):
    return ("SUBSURF", {"levels": levels, "render_levels": levels})


def set_uv_planar(obj, cx, cy, half_w, half_h):
    """UVs 0..1 across a face drawn in the panel plane, for live instrument textures."""
    mesh = obj.data
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        co = obj.matrix_world @ mesh.vertices[loop.vertex_index].co
        # Blender (x, y, z) = sim (x, -z, y): sim x = co.x, sim y = co.z
        uv.data[loop.index].uv = (0.5 + (co.x - cx) / (2 * half_w), 0.5 + (co.z - cy) / (2 * half_h))


# ---------------------------------------------------------------------------
# Fuselage outline (must match src/flight/render/cessna.ts)
# ---------------------------------------------------------------------------

STATIONS = [
    # z, top, bottom, widthTop, widthBottom, radiusTop, radiusBottom
    (-2.14, 0.3, -0.27, 0.27, 0.29, 0.22, 0.2),
    (-2.06, 0.37, -0.36, 0.38, 0.39, 0.22, 0.2),
    (-1.86, 0.43, -0.48, 0.47, 0.48, 0.2, 0.18),
    (-1.55, 0.46, -0.58, 0.52, 0.53, 0.17, 0.16),
    (-1.3, 0.48, -0.63, 0.54, 0.55, 0.15, 0.15),
    (-0.88, 0.8, -0.67, 0.52, 0.56, 0.16, 0.13),
    (-0.47, 1.03, -0.69, 0.5, 0.56, 0.15, 0.12),
    (-0.43, 1.035, -0.69, 0.5, 0.56, 0.15, 0.12),
    (0.33, 1.05, -0.69, 0.5, 0.56, 0.15, 0.12),
    (0.5, 1.05, -0.68, 0.5, 0.56, 0.15, 0.12),
    (1.07, 1.04, -0.63, 0.48, 0.54, 0.15, 0.12),
    (2.15, 0.67, -0.44, 0.4, 0.43, 0.14, 0.12),
]
# The rest of the tailcone, for the preview renders' exterior skin only.
TAIL_STATIONS = [
    (3.35, 0.53, -0.25, 0.28, 0.29, 0.12, 0.11),
    (4.55, 0.43, -0.09, 0.18, 0.18, 0.1, 0.09),
    (5.62, 0.35, 0.05, 0.07, 0.07, 0.05, 0.05),
]

SILL, STRIPE_TOP, STRIPE_BOTTOM, PINSTRIPE = 0.66, 0.44, 0.31, 0.285


def half_section(s):
    z, top, bottom, wt, wb, rt0, rb0 = s
    rt = min(rt0, wt * 0.95, (top - bottom) * 0.45)
    rb = min(rb0, wb * 0.95, (top - bottom) * 0.45)
    side_top, side_bottom = top - rt, bottom + rb

    def side_at(f):
        return (wb + (wt - wb) * f, side_bottom + (side_top - side_bottom) * f)

    def arc(cx, cy, r, a0, a1, count):
        return [
            (cx + math.cos(math.radians(a0 + (a1 - a0) * (i + 1) / (count + 1))) * r, cy + math.sin(math.radians(a0 + (a1 - a0) * (i + 1) / (count + 1))) * r)
            for i in range(count)
        ]

    return [
        (0, top),
        ((wt - rt) * 0.5, top),
        (wt - rt, top),
        *arc(wt - rt, side_top, rt, 90, 0, 2),
        side_at(1),
        side_at(SILL),
        side_at(STRIPE_TOP),
        side_at(STRIPE_BOTTOM),
        side_at(PINSTRIPE),
        side_at(0),
        *arc(wb - rb, side_bottom, rb, 0, -90, 2),
        (wb - rb, bottom),
        (0, bottom),
    ]


def section_ring(s):
    half = half_section(s)
    right = [(x, y) for x, y in half]
    left = [(-x, y) for x, y in reversed(half[1:-1])]
    return right + left


HALF_SEGMENTS = 14


def mirror(segment):
    return segment if segment < HALF_SEGMENTS else 2 * HALF_SEGMENTS - 1 - segment


def is_window(band, segment):
    """Same window layout as the exterior skin."""
    k = mirror(segment)
    roof = k in (0, 1)
    if band in (4, 5) and (roof or k in (2, 3, 4, 5)):
        return True  # windshield, wrapping down to the cowl at the sides
    if band in (7, 9) and k in (4, 5):
        return True  # door window, rear side window
    if band == 10 and (roof or k == 2):
        return True  # rear "omni-vision" window
    return False


# ---------------------------------------------------------------------------
# Cabin lining: the interior shell with real window openings and frames
# ---------------------------------------------------------------------------

def build_lining():
    part = Part("cabin_lining")
    inset_x, inset_y = 0.955, 0.975
    rings = [section_ring(s) for s in STATIONS]
    first_band, last_band = 4, 11
    verts = {}

    def vert(band_station, i):
        key = (band_station, i)
        if key not in verts:
            x, y = rings[band_station][i]
            z = STATIONS[band_station][0]
            verts[key] = part.bm.verts.new(P(x * inset_x, y * inset_y + 0.008, z))
        return verts[key]

    n = len(rings[0])
    for band in range(first_band, last_band):
        for i in range(n):
            if is_window(band, i):
                continue
            j = (i + 1) % n
            k = mirror(i)
            y = (rings[band][i][1] + rings[band][j][1] + rings[band + 1][i][1] + rings[band + 1][j][1]) / 4
            if band <= 5 and y < 0.42:
                mat = M["glare"]  # down beside the panel, behind the glareshield
            elif band <= 6 or (band == 8 and y > 0.3):
                mat = M["frame"]  # A- and B-pillars
            elif k in (0, 1) or y > 0.95:
                mat = M["headliner"]
            elif y > 0.35:
                mat = M["wall"]
            else:
                mat = M["wall_low"]
            face = part.bm.faces.new([vert(band, i), vert(band, j), vert(band + 1, j), vert(band + 1, i)])
            part._tag([face], mat)
    # Normals face into the cabin.
    bmesh.ops.recalc_face_normals(part.bm, faces=part.bm.faces)
    center = P(0, 0.3, 0)
    for f in part.bm.faces:
        c = f.calc_center_median()
        outward = Vector((c.x - center.x, 0, c.z - center.z))
        if f.normal.dot(outward) > 0:
            f.normal_flip()
    # Solidify into the cabin gives the window openings a real frame depth
    # without pushing through the skin.
    return part.finish(
        smooth_angle=35,
        recalc=False,
        modifiers=[("SOLIDIFY", {"thickness": 0.022, "offset": 1.0, "use_rim": True}), bevel(0.006, 2, 30)],
    )


# ---------------------------------------------------------------------------
# Instrument panel
# ---------------------------------------------------------------------------

PANEL_Z = -0.86
PANEL_BOTTOM = -0.06
FLOOR_Y = -0.3


def panel_top(x):
    return 0.43 - x * x * 0.26


GAUGES = {
    # name: (x, y, radius)
    "asi": (-0.388, 0.315, 0.04),
    "ai": (-0.27, 0.315, 0.04),
    "alt": (-0.152, 0.315, 0.04),
    "tc": (-0.388, 0.2, 0.04),
    "hi": (-0.27, 0.2, 0.04),
    "vsi": (-0.152, 0.2, 0.04),
    "tach": (-0.388, 0.085, 0.04),
    "vor1": (-0.035, 0.315, 0.036),
    "vor2": (-0.035, 0.2, 0.036),
    "clock": (-0.475, 0.315, 0.026),
    "suction": (-0.475, 0.2, 0.022),
    "ammeter": (-0.475, 0.12, 0.022),
}
RECT_GAUGES = {"engine": (-0.215, 0.085, 0.046), "fuel": (0.355, 0.315, 0.046)}


def build_panel():
    """The panel face: an arched outline with the instrument holes, made as a
    filled 2D curve (holes cut cleanly, no boolean), extruded for thickness."""
    curve = bpy.data.curves.new("panel_face", "CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    curve.extrude = 0.009
    curve.bevel_depth = 0.0015
    curve.bevel_resolution = 1
    curve.resolution_u = 1

    def add_poly(points):
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, (x, y) in zip(spline.points, points):
            point.co = (x, y, 0, 1)
        spline.use_cyclic_u = True

    outline = [(-0.5 + c / 40, PANEL_BOTTOM) for c in range(41)]
    outline += [(0.5 - c / 40, panel_top(0.5 - c / 40)) for c in range(41)]
    add_poly(outline)
    for name, (x, y, r) in GAUGES.items():
        add_poly([(x + math.cos(t) * (r + 0.002), y + math.sin(t) * (r + 0.002)) for t in (k / 40 * math.tau for k in range(40))])
    for name, (x, y, half) in RECT_GAUGES.items():
        h = half + 0.002
        add_poly([(x - h, y - h), (x + h, y - h), (x + h, y + h), (x - h, y + h)])
    add_poly([(0.037, 0.052), (0.223, 0.052), (0.223, 0.398), (0.037, 0.398)])  # radio stack bay
    curve.materials.append(M["panel"])
    panel = bpy.data.objects.new("panel", curve)
    export_col.objects.link(panel)
    # Curve XY -> panel plane (sim x, y); its centre sits half a thickness behind the face.
    panel.rotation_euler = (math.radians(90), 0, 0)
    panel.location = P(0, 0, PANEL_Z - 0.009)

    # Wings at each end, angled back toward the doors.
    part = Part("panel_wings")
    for side in (-1, 1):
        part.poly([P(side * 0.5, PANEL_BOTTOM, PANEL_Z), P(side * 0.555, PANEL_BOTTOM, PANEL_Z + 0.1), P(side * 0.555, panel_top(0.555), PANEL_Z + 0.1), P(side * 0.5, panel_top(0.5), PANEL_Z)], M["panel_edge"])
    part.finish(recalc=False, modifiers=[("SOLIDIFY", {"thickness": 0.012, "offset": 0.0})])
    return panel


def build_instrument_backs():
    """Bezels, dials sunk behind the holes, and the boxes the instruments sit in."""
    part = Part("instrument_cans")
    for name, (x, y, r) in GAUGES.items():
        # Black bezel ring proud of the panel, then the can behind the hole.
        ring_out = [P(x + math.cos(t) * (r + 0.007), y + math.sin(t) * (r + 0.007), PANEL_Z + 0.003) for t in (i / 40 * math.tau for i in range(40))]
        ring_in = [P(x + math.cos(t) * (r + 0.001), y + math.sin(t) * (r + 0.001), PANEL_Z + 0.004) for t in (i / 40 * math.tau for i in range(40))]
        ring_back = [P(x + math.cos(t) * (r + 0.001), y + math.sin(t) * (r + 0.001), PANEL_Z - 0.012) for t in (i / 40 * math.tau for i in range(40))]
        part.loft([ring_out, ring_in], M["bezel"], caps=False)
        part.loft([ring_in, ring_back], M["dial"], caps=False)
    for name, (x, y, half) in RECT_GAUGES.items():
        part.box((x, y, PANEL_Z - 0.012), (half * 2 + 0.01, half * 2 + 0.01, 0.006), M["dial"])
    part.box((0.13, 0.225, PANEL_Z - 0.03), (0.19, 0.35, 0.02), M["radio_face"])
    return part.finish(recalc=False, modifiers=[bevel(0.0015, 1, 60)])


def build_gauge_faces():
    """One named disc per instrument, UV-mapped 0..1 for the sim's live drawings."""
    for name, (x, y, r) in GAUGES.items():
        if name in ("suction", "ammeter"):
            continue
        part = Part(f"gauge_{name}")
        part.disc_facing_pilot(x, y, PANEL_Z - 0.0105, r, M["dial"], sides=40)
        obj = part.finish(recalc=False)
        set_uv_planar(obj, x, y, r, r)
    for name, (x, y, half) in RECT_GAUGES.items():
        part = Part(f"gauge_{name}")
        z = PANEL_Z - 0.0085
        part.poly([P(x - half, y - half, z), P(x + half, y - half, z), P(x + half, y + half, z), P(x - half, y + half, z)], M["dial"])
        obj = part.finish(recalc=False)
        set_uv_planar(obj, x, y, half, half)
    # Small static gauges: a needle each.
    static = Part("small_gauges")
    for name in ("suction", "ammeter"):
        x, y, r = GAUGES[name]
        static.disc_facing_pilot(x, y, PANEL_Z - 0.0105, r, M["dial"])
        static.box((x, y + 0.005, PANEL_Z - 0.009), (0.0018, r * 1.2, 0.001), M["switch_white"])
    static.finish(recalc=False)
    # Radio stack and annunciator faces.
    radios = Part("radios")
    z = PANEL_Z - 0.0195
    radios.poly([P(0.04, 0.055, z), P(0.22, 0.055, z), P(0.22, 0.395, z), P(0.04, 0.395, z)], M["radio_face"])
    obj = radios.finish(recalc=False)
    set_uv_planar(obj, 0.13, 0.225, 0.09, 0.17)
    ann = Part("annunciator")
    z = PANEL_Z + 0.004
    ann.poly([P(-0.43, 0.383, z), P(-0.11, 0.383, z), P(-0.11, 0.405, z), P(-0.43, 0.405, z)], M["screen"])
    obj = ann.finish(recalc=False)
    set_uv_planar(obj, -0.27, 0.394, 0.16, 0.011)


def build_panel_fittings():
    part = Part("panel_fittings")
    front = PANEL_Z + 0.004
    # Rocker switches: master and alternator red, the rest white, with legends above.
    part.box((-0.355, 0.03, front), (0.29, 0.014, 0.002), M["placard"])
    for i in range(9):
        x = -0.48 + i * 0.031
        part.box((x, -0.01, front), (0.022, 0.04, 0.008), M["bezel"])
        part.box((x, -0.003 if i % 3 == 1 else -0.017, front + 0.007), (0.016, 0.019, 0.01), M["switch_red"] if i < 2 else M["switch_white"])
    # Magneto and starter key.
    part.cylinder((-0.475, 0.06, front - 0.004), (-0.475, 0.06, front + 0.008), 0.017, M["chrome"], sides=20)
    part.box((-0.475, 0.064, front + 0.018), (0.007, 0.03, 0.02), M["knob_black"])
    # Circuit breakers along the lower right.
    part.box((0.37, -0.03, front - 0.002), (0.27, 0.035, 0.004), M["panel_edge"])
    for i in range(11):
        x = 0.25 + i * 0.024
        part.cylinder((x, -0.03, front - 0.002), (x, -0.03, front + 0.01), 0.006, M["knob_black"], sides=10)
    # Glovebox with a chrome latch.
    part.box((0.38, 0.06, front), (0.24, 0.11, 0.006), M["panel_edge"])
    part.box((0.38, 0.1, front + 0.006), (0.05, 0.012, 0.006), M["chrome"])
    # Hobbs meter, ELT switch, and the operating-limitations placard.
    part.box((0.45, 0.315, front), (0.05, 0.022, 0.006), M["screen"])
    part.box((0.45, 0.25, front + 0.002), (0.03, 0.03, 0.01), M["switch_red"])
    part.box((0.43, 0.19, front - 0.002), (0.12, 0.03, 0.002), M["placard"])
    part.box((0.355, 0.245, front - 0.002), (0.1, 0.014, 0.002), M["placard"])
    # Throttle and mixture legend, flap gate with detents.
    part.box((0.027, -0.012, front - 0.002), (0.09, 0.01, 0.002), M["placard"])
    part.box((0.255, 0.02, front - 0.002), (0.01, 0.08, 0.004), M["dial"])
    for i in range(4):
        part.box((0.276, 0.05 - i * 0.02, front - 0.001), (0.014, 0.0025, 0.002), M["placard"])
    return part.finish(recalc=True, modifiers=[bevel(0.0015, 1, 50)])


def build_glareshield():
    """A padded arc over the panel, running forward to the windshield."""
    part = Part("glareshield")
    top = 0.43
    profile = [
        (top - 0.012, PANEL_Z + 0.004),
        (top + 0.01, PANEL_Z + 0.026),
        (top + 0.03, PANEL_Z + 0.016),
        (top + 0.036, PANEL_Z - 0.02),
        (top + 0.04, PANEL_Z - 0.14),
        (top + 0.046, -1.29),
        (top - 0.04, -1.29),
        (top - 0.04, PANEL_Z - 0.06),
    ]
    xs = [-0.56 + i * 0.07 for i in range(17)]
    rings = []
    for x in xs:
        drop = top - panel_top(min(abs(x), 0.55))
        inset = 0.06 if abs(x) > 0.5 else 0.0
        rings.append([P(x, y - drop, z + inset) for y, z in profile])
    # Loft across x: build as rings along the x axis.
    part.loft(rings, M["glare"], closed=True, caps=True)
    return part.finish(smooth_angle=50, modifiers=[subsurf(1)])


def build_compass():
    part = Part("compass")
    top = 0.43
    base = (0.1, top + 0.045, PANEL_Z - 0.12)
    part.box((base[0], base[1] + 0.03, base[2]), (0.07, 0.055, 0.06), M["bezel"])
    part.box((base[0], base[1], base[2]), (0.045, 0.02, 0.05), M["bezel"])
    part.box((base[0], base[1] + 0.033, base[2] + 0.0305), (0.05, 0.026, 0.001), M["compass_card"])
    part.box((base[0], base[1] + 0.033, base[2] + 0.0312), (0.0015, 0.032, 0.001), M["switch_red"])
    return part.finish(recalc=True, modifiers=[bevel(0.004, 2, 40)])


# ---------------------------------------------------------------------------
# Controls
# ---------------------------------------------------------------------------

def circle_points(cx, cy, z, r, sides):
    return [P(cx + math.cos(t) * r, cy + math.sin(t) * r, z) for t in (i / sides * math.tau for i in range(sides))]


def build_knob(name, x, mat, radius, ribbed):
    part = Part(name)
    y = 0.02
    z0 = PANEL_Z - 0.1
    part.cylinder((x, y, z0 - 0.02), (x, y, z0 + 0.1), 0.0045, M["chrome"], sides=10)
    sides = 16
    rings = [circle_points(x, y, z0 + d, r, sides) for d, r in ((0.095, radius * 0.75), (0.1, radius), (0.122, radius), (0.128, radius * 0.7))]
    part.loft(rings, mat, mat_fn=(lambda r, i: M["rubber"] if ribbed and r == 1 and i % 2 == 0 else mat))
    return part.finish(smooth_angle=40, origin=(x, y, z0))


def build_flap_lever():
    part = Part("flap_lever")
    x, y = 0.255, 0.05
    part.box((x, y, PANEL_Z + 0.014), (0.006, 0.006, 0.026), M["chrome"])
    part.box((x, y, PANEL_Z + 0.032), (0.036, 0.016, 0.012), M["switch_white"])
    return part.finish(recalc=True, modifiers=[bevel(0.002, 2, 40)], origin=(x, y, PANEL_Z))


def build_yoke(name, x):
    """Column plus the ram's-horn wheel, pivoting at the panel."""
    part = Part(name)
    cy, z_wheel = 0.13, PANEL_Z + 0.26
    # Collar on the panel and the chrome shaft.
    part.cylinder((x, cy, PANEL_Z - 0.01), (x, cy, PANEL_Z + 0.02), 0.028, M["bezel"], sides=20)
    part.cylinder((x, cy, PANEL_Z), (x, cy, z_wheel - 0.02), 0.011, M["chrome"], sides=14)
    # Hub with the pale centre plate.
    part.cylinder((x, cy, z_wheel - 0.03), (x, cy + 0.004, z_wheel + 0.016), 0.034, M["yoke"], sides=20, radius_b=0.03)
    part.cylinder((x, cy + 0.004, z_wheel + 0.016), (x, cy + 0.004, z_wheel + 0.019), 0.024, M["yoke_plate"], sides=20)
    # Ram's-horn grips: a smooth curve each side, thickening where you hold it.
    grip = [(0.024, 0.0, 0.006), (0.07, -0.014, 0.012), (0.11, -0.008, 0.012), (0.132, 0.025, 0.01), (0.14, 0.07, 0.006), (0.134, 0.105, 0.0), (0.118, 0.125, -0.004)]
    for side in (-1, 1):
        for k in range(len(grip) - 1):
            (ax, ay, az), (bx, by, bz) = grip[k], grip[k + 1]
            radius = 0.012 + 0.006 * min(1, k / 2)
            part.cylinder((x + side * ax, cy + ay, z_wheel + az), (x + side * bx, cy + by, z_wheel + bz), radius, M["yoke"], sides=12)
    # Push-to-talk switch on the left horn.
    part.box((x - 0.13, cy + 0.07, z_wheel + 0.02), (0.012, 0.012, 0.008), M["switch_red"])
    return part.finish(smooth_angle=45, origin=(x, cy, PANEL_Z))


def build_pedestal():
    part = Part("pedestal")
    part.box((0, (FLOOR_Y + PANEL_BOTTOM) / 2 - 0.05, PANEL_Z + 0.12), (0.15, PANEL_BOTTOM - FLOOR_Y - 0.1, 0.24), M["panel_edge"])
    part.box((0.035, -0.165, PANEL_Z + 0.242), (0.02, 0.12, 0.004), M["dial"])
    part.box((0.035, -0.15, PANEL_Z + 0.245), (0.016, 0.006, 0.004), M["placard"])
    # Fuel selector on the floor between the seats.
    part.box((0, FLOOR_Y + 0.02, -0.38), (0.2, 0.02, 0.2), M["panel_edge"])
    part.cylinder((0, FLOOR_Y + 0.03, -0.38), (0, FLOOR_Y + 0.035, -0.38), 0.07, M["bezel"], sides=24)
    part.box((0, FLOOR_Y + 0.05, -0.38), (0.02, 0.04, 0.11), M["switch_red"])
    return part.finish(recalc=True, modifiers=[bevel(0.006, 2, 40)])


def build_trim_wheel():
    part = Part("trim_wheel")
    x, y, z = -0.03, -0.12, PANEL_Z + 0.2
    sides = 24
    rings = []
    for dx, r in ((-0.013, 0.07), (-0.013, 0.08), (0.013, 0.08), (0.013, 0.07)):
        rings.append([P(x + dx, y + math.cos(t) * r, z + math.sin(t) * r) for t in (i / sides * math.tau for i in range(sides))])
    part.loft(rings, M["knob_black"], mat_fn=lambda r, i: M["rubber"] if i % 2 == 0 else M["knob_black"])
    return part.finish(smooth_angle=30, origin=(x, y, z))


def build_pedals():
    for seat, seat_x in (("left", -0.27), ("right", 0.27)):
        for side_name, side in (("l", -1), ("r", 1)):
            part = Part(f"pedal_{seat}_{side_name}")
            x = seat_x + side * 0.085
            hinge = (x, FLOOR_Y + 0.22, -0.98)
            part.cylinder((x, FLOOR_Y + 0.22, -0.98), (x, FLOOR_Y + 0.1, -0.92), 0.007, M["chrome"], sides=8)
            part.box((x, FLOOR_Y + 0.1, -0.92), (0.075, 0.12, 0.014), M["rubber"], rotation=Matrix.Rotation(-0.55, 4, "X"))
            part.finish(recalc=True, modifiers=[bevel(0.003, 2, 40)], origin=hinge)


# ---------------------------------------------------------------------------
# Seats, floor, doors, overhead
# ---------------------------------------------------------------------------

def build_seats():
    part = Part("seats")
    for x in (-0.27, 0.27):
        # Cushion, backrest and headrest: rounded by the subdivision below.
        part.box((x, FLOOR_Y + 0.25, 0.0), (0.44, 0.1, 0.48), M["leather"])
        part.box((x, FLOOR_Y + 0.66, 0.31), (0.44, 0.7, 0.11), M["leather"], rotation=Matrix.Rotation(math.radians(8), 4, "X"))
        part.box((x, FLOOR_Y + 1.08, 0.36), (0.25, 0.15, 0.09), M["leather"])
        # Seat frame and rails.
        for dx in (-0.15, 0.15):
            part.box((x + dx, FLOOR_Y + 0.1, 0.0), (0.03, 0.2, 0.4), M["steel"])
            part.box((x + dx, FLOOR_Y + 0.012, -0.05), (0.02, 0.02, 0.8), M["chrome"])
    part.box((0, FLOOR_Y + 0.22, 1.02), (1.0, 0.12, 0.46), M["leather"])
    part.box((0, FLOOR_Y + 0.6, 1.27), (1.0, 0.64, 0.1), M["leather"])
    seats = part.finish(recalc=True, smooth_angle=60, modifiers=[bevel(0.03, 3, 30)])

    details = Part("seat_details")
    for x in (-0.27, 0.27):
        details.box((x, FLOOR_Y + 0.302, 0.0), (0.34, 0.006, 0.38), M["leather_dark"])
        details.box((x, FLOOR_Y + 0.66, 0.252), (0.32, 0.56, 0.006), M["leather_dark"], rotation=Matrix.Rotation(math.radians(8), 4, "X"))
        # Lap belt across the seat, shoulder harness down the back.
        details.box((x - 0.1, FLOOR_Y + 0.306, 0.05), (0.04, 0.006, 0.36), M["belt"])
        details.box((x + 0.09, FLOOR_Y + 0.66, 0.246), (0.045, 0.6, 0.006), M["belt"], rotation=Matrix.Rotation(math.radians(8), 4, "X"))
    details.finish(recalc=True)
    return seats


def build_floor_and_doors():
    part = Part("floor_doors")
    part.box((0, FLOOR_Y - 0.015, -0.15), (1.06, 0.03, 2.4), M["carpet"])
    # Firewall kick panel under the panel.
    part.box((0, -0.25, -0.9), (1.04, 0.12, 0.04), M["carpet"], rotation=Matrix.Rotation(math.radians(30), 4, "X"))
    for side in (-1, 1):
        x = side * 0.5
        part.box((x, 0.13, -0.02), (0.06, 0.05, 0.46), M["trim"])  # armrest
        part.box((side * 0.505, 0.3, -0.28), (0.03, 0.025, 0.12), M["chrome"])  # handle
        part.box((side * 0.52, -0.08, -0.1), (0.02, 0.16, 0.4), M["wall_low"])  # map pocket
    # Overhead: dome light, speaker grille, and the fresh-air vents in the wing roots.
    part.box((0, 1.0, 0.25), (0.12, 0.02, 0.07), M["placard"])
    part.box((0, 1.005, -0.25), (0.16, 0.012, 0.12), M["panel_edge"])
    for side in (-1, 1):
        part.cylinder((side * 0.47, 0.99, -0.4), (side * 0.47, 0.965, -0.4), 0.02, M["trim"], sides=14, radius_b=0.016)
    return part.finish(recalc=True, modifiers=[bevel(0.006, 2, 40)])


def build_pilot():
    """A seated pilot with a headset, hands on the yoke. Hidden in the cockpit view."""
    part = Part("pilot")
    x = -0.27
    part.box((x, FLOOR_Y + 0.55, 0.15), (0.38, 0.52, 0.24), M["shirt"])  # torso
    part.box((x, FLOOR_Y + 0.33, -0.05), (0.36, 0.14, 0.42), M["pants"])  # thighs
    for side in (-1, 1):
        part.box((x + side * 0.1, FLOOR_Y + 0.1, -0.3), (0.12, 0.38, 0.13), M["pants"], rotation=Matrix.Rotation(math.radians(20), 4, "X"))
        part.cylinder((x + side * 0.2, FLOOR_Y + 0.75, 0.12), (x + side * 0.15, 0.2, -0.38), 0.045, M["shirt"], sides=8)
        part.box((x + side * 0.13, 0.2, -0.56), (0.05, 0.06, 0.08), M["skin"])
    part.cylinder((x, FLOOR_Y + 0.81, 0.12), (x, FLOOR_Y + 0.88, 0.12), 0.05, M["skin"], sides=10)
    part.box((x, FLOOR_Y + 0.97, 0.1), (0.17, 0.2, 0.2), M["skin"])
    part.box((x, FLOOR_Y + 1.06, 0.12), (0.18, 0.06, 0.2), M["hair"])
    part.box((x, FLOOR_Y + 1.09, 0.1), (0.2, 0.025, 0.05), M["headset"])
    for side in (-1, 1):
        part.box((x + side * 0.1, FLOOR_Y + 0.98, 0.1), (0.035, 0.09, 0.09), M["headset"])
    return part.finish(recalc=True, smooth_angle=50, modifiers=[bevel(0.025, 3, 30)])


# ---------------------------------------------------------------------------
# Build, save, export
# ---------------------------------------------------------------------------

build_lining()
build_panel()
build_instrument_backs()
build_gauge_faces()
build_panel_fittings()
build_glareshield()
build_compass()
build_knob("throttle", 0.0, M["knob_black"], 0.017, False)
build_knob("mixture", 0.055, M["knob_red"], 0.014, True)
build_flap_lever()
build_yoke("yoke_left", -0.27)
build_yoke("yoke_right", 0.27)
build_pedestal()
build_trim_wheel()
build_pedals()
build_seats()
build_floor_and_doors()
build_pilot()

os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

# Export only the cabin collection, with modifiers applied.
helper_col.hide_viewport = False
for obj in helper_col.objects:
    obj.hide_set(True)
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_visible=True,
    export_apply=True,
    export_extras=True,
    export_yup=True,
)
print(f"[cabin] wrote {GLB_OUT} ({os.path.getsize(GLB_OUT) / 1024:.0f} KB)")


# ---------------------------------------------------------------------------
# Preview renders (only with --render DIR)
# ---------------------------------------------------------------------------

def render_previews(directory):
    os.makedirs(directory, exist_ok=True)
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    world = bpy.data.worlds.new("Sky")
    world.color = (0.55, 0.7, 0.9)
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.55, 0.72, 0.95, 1)
        background.inputs["Strength"].default_value = 1.0
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 4.0
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(-30))
    helper_col.objects.link(sun)
    ground = Part("ground")
    ground.poly([P(-200, -1.15, -200), P(200, -1.15, -200), P(200, -1.15, 200), P(-200, -1.15, 200)], material("ground", 0x7f9a62))
    ground.finish(collection=helper_col, recalc=False)

    # The exterior skin (windows left open) so the previews show the cockpit in context.
    skin = Part("preview_skin")
    stations = STATIONS + TAIL_STATIONS
    rings = [[P(x, y, s[0]) for x, y in section_ring(s)] for s in stations]
    paint = material("preview_paint", 0xf4f3ef, 0.4)
    n = len(rings[0])
    verts = [[skin.bm.verts.new(v) for v in ring] for ring in rings]
    for band in range(len(rings) - 1):
        for i in range(n):
            if is_window(band, i):
                continue
            j = (i + 1) % n
            f = skin.bm.faces.new([verts[band][i], verts[band][j], verts[band + 1][j], verts[band + 1][i]])
            skin._tag([f], paint)
    skin.finish(collection=helper_col, smooth_angle=40)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = math.radians(70)
    cam_data.clip_start = 0.02
    cam = bpy.data.objects.new("Camera", cam_data)
    helper_col.objects.link(cam)
    scene.camera = cam

    def shoot(name, eye, yaw_deg, pitch_deg, fov=70):
        cam_data.angle = math.radians(fov)
        cam.location = P(*eye)
        # Blender camera looks down -Z local; aim it along sim -z (Blender +y).
        cam.rotation_euler = (math.radians(90 + pitch_deg), 0, math.radians(yaw_deg))
        scene.render.filepath = os.path.join(directory, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[cabin] rendered {scene.render.filepath}")

    eye = (-0.27, 0.78, -0.06)
    shoot("cockpit", eye, 0, -8)
    shoot("panel", eye, -4, -20, fov=45)
    shoot("left", eye, 70, -5)
    shoot("right", eye, -55, -8)
    shoot("cabin-wide", (0.3, 0.95, 0.9), 12, -18, fov=80)


if RENDER_DIR:
    render_previews(RENDER_DIR)
