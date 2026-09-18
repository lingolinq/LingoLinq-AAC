#!/usr/bin/env bash
# compliance-notion-page-publish-test.sh - regression coverage for the posture-page publisher
# (scripts/compliance-notion-page-publish.rb) and its converter (scripts/notion_markdown_blocks.rb).
#
# Network-free by construction: every case runs with NOTION_TOKEN unset and https_proxy pointed at
# a closed local port, so any accidental HTTP call fails loudly instead of reaching Notion.
#
# Cases:
#   1. The committed generated page converts in --dry-run: one 5-column headline table (header +
#      2 count rows), one 6-column findings table, 12 top-level blocks (wrapped bullets fold).
#   2. Converter fixture: headings, quote, bullets, paragraph with a hard break, ragged table
#      padded to header width, escaped pipe kept, inline bold/code annotated, a 4500-char run
#      chunked into <=2000-char rich_text objects (never sliced).
#   3. Live mode without NOTION_TOKEN aborts non-zero before any network call.
#   4. Missing --input aborts non-zero.
#   5. An empty body aborts non-zero (never publishes a blank page).
#
# Usage: scripts/tests/compliance-notion-page-publish-test.sh
# Exit: 0 = every case behaved; 1 = at least one did not.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

export https_proxy=http://127.0.0.1:9 http_proxy=http://127.0.0.1:9
unset NOTION_TOKEN

PUB=scripts/compliance-notion-page-publish.rb
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
fail=0
ok()   { printf '  ok   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }

echo "-- case 1: committed page dry-run --"
out=$(ruby "$PUB" --dry-run --blocks-out "$TMP/page.json" 2>&1); rc=$?
if [ $rc -eq 0 ] && grep -q 'dry-run, nothing sent' <<<"$out"; then ok "dry-run exits 0 and sends nothing"; else bad "dry-run: rc=$rc $out"; fi
if grep -q 'tables 5x3, 6x' <<<"$out"; then ok "headline table is 5 columns x 3 rows and findings table is 6 columns"; else bad "unexpected table shapes: $out"; fi
if grep -q '12 top-level blocks' <<<"$out"; then ok "12 top-level blocks (3 wrapped Notes bullets fold into 3 items)"; else bad "block count: $out"; fi
if [ -s "$TMP/page.json" ] && ruby -rjson -e 'exit(JSON.parse(File.read(ARGV[0])).first["type"]=="heading_1" ? 0 : 1)' "$TMP/page.json"; then ok "--blocks-out written, first block is the h1"; else bad "--blocks-out missing or wrong"; fi

echo "-- case 2: converter fixture --"
long=$(printf 'x%.0s' $(seq 1 4500))
cat > "$TMP/fixture.md" <<EOF
# Title

> quoted line one
> quoted line two

**Bold lead:** plain and \`code\`
second line after hard break

## Section

- bullet one
- bullet **two** wraps onto
  a continuation line

| A | B | C |
|---|---|---|
| 1 | 2 |
| a \\| pipe | b | c | extra |

---

$long
EOF
# Markdown hard break = two trailing spaces; added here so the fixture in this file stays
# whitespace-clean for `git diff --check`.
sed -i 's/^\(\*\*Bold lead.*\)$/\1  /' "$TMP/fixture.md"
ruby "$PUB" --dry-run --input "$TMP/fixture.md" --blocks-out "$TMP/fx.json" >/dev/null 2>&1 || bad "fixture dry-run failed"
ruby -rjson - "$TMP/fx.json" <<'RB' || fail=1
b = JSON.parse(File.read(ARGV[0]))
types = b.map { |x| x['type'] }
def chk(cond, msg) = puts((cond ? '  ok   ' : '  FAIL ') + msg) || (exit 1 unless cond)
chk types == %w[heading_1 quote paragraph heading_2 bulleted_list_item bulleted_list_item table divider paragraph],
    "block sequence #{types.join(',')}"
q = b[1]['quote']['rich_text'].map { |r| r['text']['content'] }.join
chk q == "quoted line one\nquoted line two", 'multi-line quote joined with newlines'
p1 = b[2]['paragraph']['rich_text']
chk p1.first['annotations'] == { 'bold' => true } && p1.first['text']['content'] == 'Bold lead:', 'inline bold annotated'
chk p1.any? { |r| r['annotations'] == { 'code' => true } && r['text']['content'] == 'code' }, 'inline code annotated'
chk p1.map { |r| r['text']['content'] }.join.include?("\nsecond line"), 'hard break becomes a newline, trailing spaces stripped'
chk b[5]['bulleted_list_item']['rich_text'].any? { |r| r['annotations'] == { 'bold' => true } }, 'bold inside a bullet'
chk b[5]['bulleted_list_item']['rich_text'].map { |r| r['text']['content'] }.join == 'bullet two wraps onto a continuation line', 'two-space continuation line folds into the bullet'
t = b[6]['table']
chk t['table_width'] == 3 && t['children'].length == 3, "table 3 wide x 3 rows (header + 2), got #{t['table_width']}x#{t['children'].length}"
chk t['children'].all? { |r| r['table_row']['cells'].length == 3 }, 'short row padded and long row truncated to header width'
chk t['children'][2]['table_row']['cells'][0].map { |r| r['text']['content'] }.join == 'a | pipe', 'escaped pipe restored inside a cell'
last = b.last['paragraph']['rich_text']
chk last.length == 3 && last.map { |r| r['text']['content'].length } == [2000, 2000, 500], "4500-char run chunked to #{last.map { |r| r['text']['content'].length }.inspect}"
chk last.map { |r| r['text']['content'] }.join.length == 4500, 'no characters lost in chunking'
RB

echo "-- case 3: live mode without token --"
out=$(ruby "$PUB" --input "$TMP/fixture.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'set NOTION_TOKEN' <<<"$out" && grep -q 'Nothing sent' <<<"$out"; then ok "aborts before network when NOTION_TOKEN is unset"; else bad "token guard: rc=$rc $out"; fi

echo "-- case 4: missing input --"
out=$(ruby "$PUB" --dry-run --input "$TMP/nope.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'input not found' <<<"$out"; then ok "missing input aborts"; else bad "missing input: rc=$rc $out"; fi

echo "-- case 5: empty body --"
: > "$TMP/empty.md"
out=$(ruby "$PUB" --dry-run --input "$TMP/empty.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'refusing to publish an empty page' <<<"$out"; then ok "empty body refused"; else bad "empty body: rc=$rc $out"; fi

if [ $fail -eq 0 ]; then echo "compliance-notion-page-publish-test: PASS"; else echo "compliance-notion-page-publish-test: FAIL"; exit 1; fi
