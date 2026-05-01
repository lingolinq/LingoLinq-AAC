#!/usr/bin/env python3
"""Extract a depth-capped OBZ board set for the public Speak Mode demo."""

import argparse
import base64
import json
import posixpath
import re
import shutil
import zipfile
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import unquote_to_bytes


def read_json(archive, name):
    return json.loads(archive.read(name).decode('utf-8'))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def normalize_asset_name(path):
    return posixpath.basename(path)


def load_board_graph(archive, manifest):
    board_paths = [name for name in archive.namelist() if name.endswith('.obf')]
    boards = {path: read_json(archive, path) for path in board_paths}
    path_by_id = {
        board.get('id'): path
        for path, board in boards.items()
        if board.get('id')
    }
    children = defaultdict(list)

    for path, board in boards.items():
        for button in board.get('buttons') or []:
            load_board = button.get('load_board')
            if not load_board:
                continue
            target = (
                load_board.get('path') or
                path_by_id.get(load_board.get('id')) or
                load_board.get('id')
            )
            children[path].append(target)

    root = manifest['root']
    depths = {root: 0}
    queue = deque([root])
    while queue:
        path = queue.popleft()
        for target in children[path]:
            if target in boards and target not in depths:
                depths[target] = depths[path] + 1
                queue.append(target)

    return boards, path_by_id, children, depths


def image_path_for(image, manifest_images):
    return image.get('path') or manifest_images.get(image.get('id')) or image.get('data') or image.get('data_url') or image.get('url')


def embedded_image_extension(data_url):
    match = re.match(r'^data:([^;,]+)', data_url or '')
    mime = match.group(1).lower() if match else ''
    return {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
    }.get(mime, '.img')


def safe_asset_stem(value, fallback):
    value = value or fallback
    return re.sub(r'[^A-Za-z0-9_.-]+', '_', str(value)).strip('._') or fallback


def write_embedded_image(data_url, target):
    header, data = data_url.split(',', 1)
    if ';base64' in header:
        content = base64.b64decode(data)
    else:
        content = unquote_to_bytes(data)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def selected_image_ids(board):
    ids = set()
    for button in board.get('buttons') or []:
        if button.get('image_id'):
            ids.add(button['image_id'])
    return ids


def load_single_obf(source):
    board = json.loads(Path(source).read_text(encoding='utf-8'))
    board_path = Path(source).name
    manifest = {
        'format': board.get('format'),
        'root': board_path,
        'paths': {
            'images': {}
        }
    }
    boards = {board_path: board}
    path_by_id = {board.get('id'): board_path} if board.get('id') else {}
    children = defaultdict(list)
    depths = {board_path: 0}
    return manifest, boards, path_by_id, children, depths


def rewrite_board(board, board_path, selected_paths, path_by_id, manifest_images, copied_images):
    board = json.loads(json.dumps(board))
    board['demo_source_path'] = board_path

    image_ids = selected_image_ids(board)
    image_by_id = {
        image.get('id'): image
        for image in board.get('images') or []
        if image.get('id')
    }
    rewritten_images = []
    for image_id in sorted(image_ids):
        image = image_by_id.get(image_id)
        if not image:
            continue
        source_path = image_path_for(image, manifest_images)
        rewritten = dict(image)
        if source_path and source_path in copied_images:
            rewritten['path'] = copied_images[source_path]
            rewritten['url'] = '/' + copied_images[source_path]
            rewritten.pop('data', None)
            rewritten.pop('data_url', None)
        rewritten_images.append(rewritten)
    board['images'] = rewritten_images

    for button in board.get('buttons') or []:
        load_board = button.get('load_board')
        if not load_board:
            continue
        target = (
            load_board.get('path') or
            path_by_id.get(load_board.get('id')) or
            load_board.get('id')
        )
        rewritten_load_board = {
            'id': load_board.get('id'),
            'path': target,
        }
        if target in selected_paths:
            rewritten_load_board['demo_path'] = 'boards/' + normalize_asset_name(target)
            rewritten_load_board['demo_available'] = True
        else:
            rewritten_load_board['demo_available'] = False
            rewritten_load_board['demo_disabled_reason'] = 'depth_cap'
        button['load_board'] = rewritten_load_board

    return board


def extract(source, dest, max_depth):
    source = Path(source)
    dest = Path(dest)
    boards_dest = dest / 'boards'
    images_dest = dest / 'images'

    if dest.exists():
        shutil.rmtree(dest)
    boards_dest.mkdir(parents=True, exist_ok=True)
    images_dest.mkdir(parents=True, exist_ok=True)

    if source.suffix.lower() == '.obf':
        archive = None
        manifest, boards, path_by_id, children, depths = load_single_obf(source)
    else:
        archive = zipfile.ZipFile(source)

    try:
        if archive:
            manifest = read_json(archive, 'manifest.json')
            boards, path_by_id, children, depths = load_board_graph(archive, manifest)
        selected_paths = {
            path
            for path, depth in depths.items()
            if depth <= max_depth
        }
        manifest_images = (manifest.get('paths') or {}).get('images') or {}

        copied_images = {}
        for board_path in sorted(selected_paths):
            board = boards[board_path]
            image_by_id = {
                image.get('id'): image
                for image in board.get('images') or []
                if image.get('id')
            }
            for image_id in selected_image_ids(board):
                image = image_by_id.get(image_id)
                if not image:
                    continue
                source_path = image_path_for(image, manifest_images)
                if not source_path or source_path in copied_images:
                    continue
                if str(source_path).startswith('data:'):
                    asset_name = safe_asset_stem(image_id, 'image') + embedded_image_extension(source_path)
                    target = images_dest / asset_name
                    write_embedded_image(source_path, target)
                    copied_images[source_path] = 'demo-boards/images/' + asset_name
                    continue
                if not archive or source_path not in archive.namelist():
                    continue
                asset_name = normalize_asset_name(source_path)
                archive.extract(source_path, dest)
                extracted = dest / source_path
                target = images_dest / asset_name
                if extracted != target:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(extracted), str(target))
                copied_images[source_path] = 'demo-boards/images/' + asset_name

        for board_path in sorted(selected_paths):
            rewritten = rewrite_board(
                boards[board_path],
                board_path,
                selected_paths,
                path_by_id,
                manifest_images,
                copied_images
            )
            write_json(boards_dest / normalize_asset_name(board_path), rewritten)

        extracted_images_dir = dest / 'images'
        for child in list(dest.iterdir()):
            if child.is_dir() and child.name not in ['boards', 'images']:
                shutil.rmtree(child)

        disabled_links = 0
        enabled_links = 0
        total_buttons = 0
        for board_path in selected_paths:
            for button in boards[board_path].get('buttons') or []:
                total_buttons += 1
                load_board = button.get('load_board')
                if not load_board:
                    continue
                target = (
                    load_board.get('path') or
                    path_by_id.get(load_board.get('id')) or
                    load_board.get('id')
                )
                if target in selected_paths:
                    enabled_links += 1
                else:
                    disabled_links += 1

        demo_manifest = {
            'source': source.name,
            'format': manifest.get('format'),
            'root': 'boards/' + normalize_asset_name(manifest['root']),
            'root_source_path': manifest['root'],
            'max_depth': max_depth,
            'boards': {
                path: {
                    'path': 'boards/' + normalize_asset_name(path),
                    'id': boards[path].get('id'),
                    'name': boards[path].get('name'),
                    'depth': depths.get(path),
                }
                for path in sorted(selected_paths)
            },
            'stats': {
                'boards': len(selected_paths),
                'buttons': total_buttons,
                'enabled_folder_buttons': enabled_links,
                'disabled_folder_buttons': disabled_links,
                'images': len(copied_images),
            }
        }
        write_json(dest / 'manifest.json', demo_manifest)

    finally:
        if archive:
            archive.close()

    print(json.dumps(demo_manifest['stats'], indent=2, sort_keys=True))
    print('Wrote ' + str(dest))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', help='Path to source .obz file')
    parser.add_argument('--dest', default='public/demo-boards', help='Destination directory')
    parser.add_argument('--max-depth', type=int, default=1, help='Maximum linked-board depth to extract')
    args = parser.parse_args()
    extract(args.source, args.dest, args.max_depth)


if __name__ == '__main__':
    main()
