"""Original, unbranded hardware plates. Blender 4.5 LTS / Cycles CPU.

Only the encoded movie ships. No remote models, textures, HDRIs or paid APIs.
Run through scripts/render-launch-film.mjs, or use --probe for a lighting proof.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import numpy as np

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--textures', required=True)
parser.add_argument('--theme', choices=['light', 'dark'], default='light')
parser.add_argument('--probe', action='store_true')
parser.add_argument('--metadata-only', action='store_true')
parser.add_argument('--model-only', action='store_true', help='Export camera-independent Blender hardware for the offline moving-camera renderer')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out, textures = Path(args.out).resolve(), Path(args.textures).resolve()
out.mkdir(parents=True, exist_ok=True)
dark = args.theme == 'dark'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16 if args.probe else 24
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.resolution_percentage = 50 if args.probe else 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.2 if dark else 0.0


def rgba(value):
    value = value.lstrip('#')
    # Material inputs are scene-linear, not display RGB.
    def linear(n):
        c = int(n, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + .055) / 1.055) ** 2.4
    return (*[linear(value[i:i + 2]) for i in (0, 2, 4)], 1)


def material(name, color, metallic=0, roughness=.4, coat=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    bsdf = result.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba(color)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = .09
    return result


metal = material('Satin graphite' if dark else 'Bead-blasted aluminum', '#737782' if dark else '#bfc0c2', .95, .27)
edge = material('Polished chamfers', '#a1a9b7' if dark else '#e0e1e4', .98, .16)
black = material('Black glass', '#08090b', .18, .12, .85)
keys = material('Key caps', '#16171a', .12, .4)
engraving = material('Key legends', '#b6b8bd', .0, .5)


def rounded(name, width, height, radius, depth, mat, location=(0, 0, 0), parent=None):
    # Separate planar corner radius from the very small edge bevel. A cube's
    # bevel would clamp the silhouette to its thin depth and make it boxy.
    points = []
    for cx, cz, angle in [(width/2-radius, height/2-radius, 0), (-width/2+radius, height/2-radius, 90), (-width/2+radius, -height/2+radius, 180), (width/2-radius, -height/2+radius, 270)]:
        for i in range(17):
            a = math.radians(angle + i * 90 / 16)
            points.append((cx + math.cos(a)*radius, cz + math.sin(a)*radius))
    count = len(points)
    vertices = [(x, y, z) for y in [-depth/2, depth/2] for x, z in points]
    faces = [tuple(range(count)), tuple(range(count*2-1, count-1, -1))]
    faces += [(i, i+count, (i+1) % count+count, (i+1) % count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.location = location
    if parent:
        obj.parent = parent
    bevel = obj.modifiers.new('Machined edge', 'BEVEL')
    bevel.width, bevel.segments = min(.018, depth/4), 3
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = .4
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    for poly in mesh.polygons[2:]:
        poly.use_smooth = True
    return obj


def group(name, location, rotation=0):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler.z = rotation
    return obj


def screen(name, width, height, radius, image, parent, location):
    obj = rounded(name, width, height, radius, .006, black, location, parent)
    # UVs are defined on the physical screen, not on its perspective bounds.
    uv = obj.data.uv_layers.new(name='Display UV')
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (co.x / width + .5, co.z / height + .5)
    mat = material(name + ' LCD', '#ffffff', .0, .7, .0)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    shader = mat.node_tree.nodes.get('Principled BSDF')
    if not args.model_only:
        node.image = bpy.data.images.load(str(textures / image), check_existing=True)
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = .9
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return node


phone = group('Phone', (-4.55, -.25, 2.61), math.radians(-8))
rounded('Titanium body', 2.48, 5.2, .37, .27, metal, parent=phone)
rounded('Polished display rim', 2.46, 5.18, .36, .026, edge, (0, -.141, 0), phone)
rounded('Cover glass', 2.415, 5.135, .34, .025, black, (0, -.158, 0), phone)
phone_texture = screen('Phone display', 2.30, 5.00, .29, 'screen-phone-sending.png', phone, (0, -.175, 0))
rounded('Camera island', .72, .19, .095, .008, black, (0, -.185, 2.31), phone)
rounded('Home indicator', .77, .027, .013, .008, engraving, (0, -.185, -2.36), phone)
for x, z, height in [(-1.25, 1.45, .23), (-1.25, .94, .44), (-1.25, .34, .44), (1.25, .94, .67)]:
    rounded('Side control', .055, height, .025, .12, edge, (x, 0, z), phone)

laptop = group('Laptop', (2.50, .15, 0), math.radians(7))
base = rounded('Unibody base', 10.30, 6.25, .23, .19, metal, (0, -1.25, .16), laptop)
base.rotation_euler.x = math.pi / 2
trackpad = rounded('Trackpad chamfer', 3.80, 1.80, .12, .016, edge, (0, -3.07, .262), laptop)
trackpad.rotation_euler.x = math.pi / 2
trackpad_face = rounded('Trackpad face', 3.76, 1.76, .10, .018, metal, (0, -3.07, .267), laptop)
trackpad_face.rotation_euler.x = math.pi / 2
for row, labels in enumerate(['esc 1 2 3 4 5 6 7 8 9 0 - =', 'tab Q W E R T Y U I O P [ ]', 'caps A S D F G H J K L ; enter', 'shift Z X C V B N M , . / shift', 'fn ctrl alt space cmd alt arrows']):
    values = labels.split()
    weights = [5.3 if item == 'space' else 1.6 if item in ('shift', 'enter', 'tab', 'caps') else 1 for item in values]
    unit = (8.95 - .065*(len(values)-1)) / sum(weights)
    x = -4.475
    for label, weight in zip(values, weights):
        width = weight * unit
        obj = rounded('Key ' + label, width, .43, .055, .048, keys, (x + width/2, .59-row*.52, .285), laptop)
        obj.rotation_euler.x = math.pi / 2
        if len(label) == 1:
            curve = bpy.data.curves.new('Legend', 'FONT')
            curve.body, curve.size, curve.align_x = label, .115, 'CENTER'
            glyph = bpy.data.objects.new('Engraved ' + label, curve)
            bpy.context.collection.objects.link(glyph)
            glyph.parent, glyph.location = laptop, (x+width/2, .55-row*.52, .315)
            curve.materials.append(engraving)
        x += width + .065
lid = group('Display hinge', (0, 1.44, .30))
lid.parent = laptop
lid.rotation_euler.x = -.12
rounded('Display shell', 10.24, 6.67, .15, .18, metal, (0, 0, 3.335), lid)
rounded('Display bezel', 10.16, 6.59, .13, .016, black, (0, -.103, 3.335), lid)
laptop_texture = screen('Laptop display', 9.94, 6.455, .08, 'screen-laptop-empty.png', lid, (0, -.117, 3.335))

# The floor contributes contact shadows but is not a giant white rectangle in
# dark mode. Its transparent shadow plate composites onto the actual palette.
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name, floor.is_shadow_catcher = 'Seamless shadow catcher', True
floor.data.materials.append(material('Studio floor', '#272727' if dark else '#ffffff', 0, .65))
world = bpy.data.worlds.new('Soft studio ambience')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = rgba('#8491a8' if dark else '#ffffff')
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .16 if dark else .45
scene.world = world


def light(name, location, power, size, color, target=(0, 0, 2)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = power, 'DISK', size
    data.color = rgba(color)[:3]
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


light('Large softbox', (-7, -8, 13), 4300, 9, '#f5f6fa')
light('Edge strip', (5, 5, 11), 6400 if dark else 4100, 7, '#dce5ff' if dark else '#ffffff')
light('Front fill', (7, -8, 5), 1500 if dark else 2500, 6, '#ffffff')
if dark:
    light('Warm material bounce', (-8, 1, 4), 1000, 4, '#ff9466')

if args.model_only:
    # Native UI footage is attached to these UV-mapped displays by the offline
    # renderer. Geometry, bevels and physical materials remain Blender-authored.
    for obj in list(scene.objects):
        if obj.type == 'FONT':
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target='MESH')
    bpy.ops.export_scene.gltf(
        filepath=str(out / 'studio.glb'), export_format='GLB',
        export_apply=True, export_yup=True, export_cameras=False,
        export_lights=False,
    )
    print('Blender hardware model:', out / 'studio.glb')
    sys.exit(0)

bpy.ops.object.camera_add(location=(10.5, -25, 13))
camera = bpy.context.object
camera.name, camera.data.lens = 'Product lens', 52
camera.data.clip_end = 300
scene.camera = camera


def point_at(target):
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z', 'Y').to_euler()


def render(name):
    scene.render.filepath = str(out / (name + '.png'))
    bpy.ops.render.render(write_still=True)


point_at((.15, -.1, 2.7))
bpy.context.view_layer.update()
coordinates = {}
meta = json.loads((textures / 'textures.json').read_text())
source, destination = meta['phone-sending'], meta['laptop-complete']


def project(point):
    p = world_to_camera_view(scene, camera, point)
    return [round(p.x*1920, 6), round((1-p.y)*1080, 6)]


def display_matrix(parent, w, h, y, z, pixels):
    corners = [project(parent.matrix_world @ Vector((x, y, z+v))) for x, v in [(-w/2, h/2), (w/2, h/2), (w/2, -h/2), (-w/2, -h/2)]]
    rows, values = [], []
    for (u, v), (x, yy) in zip([(0, 0), (pixels[0], 0), pixels, (0, pixels[1])], corners):
        rows += [[u, v, 1, 0, 0, 0, -x*u, -x*v], [0, 0, 0, u, v, 1, -yy*u, -yy*v]]
        values += [x, yy]
    a, b, c, d, e, f, g, hh = np.linalg.solve(rows, values)
    return [a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1]


coordinates['screens'] = {
    'phone': display_matrix(phone, 2.30, 5.00, -.179, 0, (402, 874)),
    'laptop': display_matrix(lid, 9.94, 6.455, -.121, 3.335, (1512, 982)),
}
coordinates['anchors'] = {'phone': {}, 'laptop': {}}
for name, parent, info, w, h, y, z in [('phone', phone, source, 2.30, 5.00, -.19, 0), ('laptop', lid, destination, 9.94, 6.455, -.13, 3.335)]:
    for kind in ['text', 'file', 'video']:
        uv = info.get(kind, info)
        coordinates['anchors'][name][kind] = project(parent.matrix_world @ Vector(((uv['u']-.5)*w, y, z+(uv['v']-.5)*h)))
    coordinates[name] = coordinates['anchors'][name]['file']
(out / 'studio.json').write_text(json.dumps(coordinates))
if args.metadata_only:
    sys.exit(0)
render('plate-ready')
if not args.probe:
    phone_texture.image = bpy.data.images.load(str(textures / 'screen-phone-complete.png'), check_existing=True)
    laptop_texture.image = bpy.data.images.load(str(textures / 'screen-laptop-complete.png'), check_existing=True)
    render('plate-complete')
print('Studio plates complete:', out)
