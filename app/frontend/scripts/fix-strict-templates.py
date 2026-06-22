#!/usr/bin/env python3
"""Iteratively fix Ember 5 strict-mode template issues until build passes."""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / 'app' / 'templates'

BLOCK_HELPERS = ('if', 'unless', 'each', 'with')
ROUTE_PROPS = (
    'session', 'subscription', 'model', 'app_state', 'appState',
    'gift', 'purchase_error', 'organization', 'search', 'user',
    'loading', 'error', 'page', 'pages', 'total_pages',
    'trends', 'stats', 'notification', 'voice', 'access', 'home_return',
    'show_expiration_notes', 'extras_status', 'show_premium_symbols',
    'cancel_reason', 'confirmation', 'reading', 'setup',
)


def is_route_template(path: pathlib.Path) -> bool:
    parts = path.parts
    return (
        path.suffix == '.hbs'
        and 'templates' in parts
        and 'components' not in parts
        and 'modals.legacy' not in parts
    )


def fix_spacing(text: str) -> str:
    for helper in BLOCK_HELPERS:
        text = re.sub(rf'\{{\{{\s*#\s+{helper}\b', rf'{{{{#{helper}', text)
    text = re.sub(r'\{\{\s+action\b', '{{action', text)
    return text


def fix_action_on(text: str) -> str:
    def repl(m):
        action = m.group(1)
        event = m.group(2)
        rest = (m.group(3) or '').strip()
        inner = f'action "{action}"'
        if rest:
            inner += ' ' + rest
        return f'{{{{on "{event}" ({inner})}}}}'

    return re.sub(
        r'\{\{action "([^"]+)" on="(submit|click|keyDown|keydown|blur|change|select)"([^}]*)\}\}',
        repl,
        text,
        flags=re.IGNORECASE,
    )


def prefix_route_prop(text: str, prop: str) -> str:
    text = re.sub(rf'\{{\{{#if {prop}\b', rf'{{{{#if this.{prop}', text)
    text = re.sub(rf'\{{\{{else if {prop}\b', rf'{{{{else if this.{prop}', text)
    text = re.sub(rf'\{{\{{#unless {prop}\b', rf'{{{{#unless this.{prop}', text)
    text = re.sub(rf'\{{\{{#each {prop}\.', rf'{{{{#each this.{prop}.', text)
    text = re.sub(rf'\{{\{{{prop}\.', rf'{{{{this.{prop}.', text)
    text = re.sub(rf'class=\{{\{{if {prop} ', rf'class={{{{if this.{prop} ', text)
    text = re.sub(rf'\{{\{{#if {prop}\.', rf'{{{{#if this.{prop}.', text)
    text = re.sub(rf'\{{\{{else if {prop}\.', rf'{{{{else if this.{prop}.', text)
    text = re.sub(rf'\{{\{{#unless {prop}\.', rf'{{{{#unless this.{prop}.', text)
    return text


def fix_file(path: pathlib.Path, scope_name: str | None = None) -> bool:
    text = path.read_text()
    orig = text
    text = fix_spacing(text)
    text = fix_action_on(text)

    if is_route_template(path):
        props = [scope_name] if scope_name else []
        if scope_name and scope_name not in ROUTE_PROPS:
            props = [scope_name]
        elif not scope_name:
            props = list(ROUTE_PROPS)
        for prop in props:
            if prop:
                text = prefix_route_prop(text, prop)

    if text != orig:
        path.write_text(text)
        return True
    return False


def parse_error(output: str) -> tuple[pathlib.Path | None, str | None]:
    m = re.search(r"error occurred in 'frontend/templates/([^']+)'", output)
    if not m:
        m = re.search(r'frontend/templates/([\w./_-]+\.hbs)', output)
    if not m:
        return None, None
    rel = m.group(1).lstrip('/')
    if rel.startswith('frontend/templates/'):
        rel = rel[len('frontend/templates/') :]
    path = TEMPLATES / rel
    if not path.exists():
        path = TEMPLATES / pathlib.Path(rel).name
    scope = None
    m2 = re.search(r'not in scope: ([^:\s]+)', output)
    if m2:
        scope = m2.group(1).strip()
    return (path if path.exists() else None), scope


def main():
    for i in range(500):
        proc = subprocess.run(
            ['npm', 'run', 'build'],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        out = proc.stdout + proc.stderr
        if proc.returncode == 0:
            print(f'BUILD SUCCESS after {i} iterations')
            return 0

        path, scope = parse_error(out)
        if not path:
            if 'Parse error' in out:
                m = re.search(r'frontend/templates/([\w./_-]+\.hbs)', out)
                if m:
                    path = TEMPLATES / m.group(1).replace('frontend/templates/', '')
            if not path or not path.exists():
                print('BUILD FAILED (unparsed):')
                print(out[-3000:])
                return 1

        if fix_file(path, scope):
            print(f'{i + 1}: fixed {path.relative_to(ROOT)} ({scope or "patterns"})')
            continue

        print(f'STUCK on {path.relative_to(ROOT)}')
        idx = out.find('error occurred')
        print(out[idx : idx + 1000] if idx >= 0 else out[-1500:])
        return 1

    print('max iterations')
    return 1


if __name__ == '__main__':
    sys.exit(main())
