#!/usr/bin/env bash
# compliance-notion-page-publish-test.sh - regression coverage for the CONVERTER
# (scripts/notion_markdown_blocks.rb) and the ARGUMENT GUARDS of the posture-page publisher
# (scripts/compliance-notion-page-publish.rb). It does not exercise the append / delete / verify
# sequence against Notion; that path is guarded at run time by the pre-delete count check and the
# read-back verify inside the publisher, and by the operator running --dry-run first.
#
# Network-free by construction: NOTION_API_BASE points at a closed local port, so any request the
# publisher makes fails with ECONNREFUSED instead of reaching Notion. (A proxy env var is NOT a
# valid canary here: Net::HTTP.start(host, port, opts) ignores https_proxy.) Case 8 proves the
# canary fires.
#
# Cases:
#   1. The committed generated page converts in --dry-run (type sequence starts with the h1, a
#      5-wide headline table with at least 3 rows, no error). Exact block counts are NOT asserted:
#      the page shape legitimately changes when the generator or the register changes.
#   2. Converter fixture: headings, quote, bullets (with a wrapped continuation line), paragraph
#      with a hard break, italic note, short table row padded, escaped pipe and escaped backslash
#      inside a cell, a data row of dashes kept, inline bold/code, a 4500-char run chunked.
#   3. A row wider than its header is refused (non-zero, nothing published).
#   4. A rich_text run over 100 segments is refused (non-zero).
#   5. Live mode without NOTION_TOKEN aborts before any request.
#   6. Missing --input aborts; an empty body aborts.
#   7. An input other than the committed page needs --allow-unchecked-input; a bad --page-id aborts.
#   8. The committed page by an EQUIVALENT path still runs the drift guard, then fails at the
#      closed port (proves the guard is path-normalized and the canary is real).
#
# Assertions accumulate; the harness reports every failure in one run.
# Usage: scripts/tests/compliance-notion-page-publish-test.sh
# Exit: 0 = every case behaved; 1 = at least one did not.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

export NOTION_API_BASE=http://127.0.0.1:9
unset NOTION_TOKEN NOTION_POSTURE_PAGE_ID

PUB=scripts/compliance-notion-page-publish.rb
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
fail=0
ok()  { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fail=1; }

echo "-- case 1: committed page dry-run --"
out=$(ruby "$PUB" --dry-run --blocks-out "$TMP/page.json" 2>&1); rc=$?
if [ $rc -eq 0 ] && grep -q 'dry-run, nothing sent' <<<"$out"; then ok "dry-run exits 0 and sends nothing"; else bad "dry-run: rc=$rc $out"; fi
ruby -rjson -e '
  b = JSON.parse(File.read(ARGV[0]))
  ok = b.first["type"] == "heading_1"
  t = b.select { |x| x["type"] == "table" }
  ok &&= t.any? { |x| x["table"]["table_width"] == 5 && x["table"]["children"].length >= 3 }
  exit(ok ? 0 : 1)' "$TMP/page.json" && ok "h1 first; a 5-wide headline table with >= 3 rows" || bad "committed page shape"

echo "-- case 2: converter fixture --"
ruby -e '
  long = "x" * 4500
  File.write(ARGV[0], <<~MD)
    # Title

    > quoted line one
    > quoted line two

    **Bold lead:** plain and `code`  #{""}
    second line after hard break

    _an italic note_

    ## Section

    - bullet one
    - bullet **two** wraps onto
      a continuation line

    | A | B | C |
    |---|---|---|
    | 1 | 2 |
    | a \\| pipe | ends with \\\\ | - |
    | - | - | - |

    ---

    #{long}
  MD
' "$TMP/fixture.md"
ruby "$PUB" --dry-run --input "$TMP/fixture.md" --blocks-out "$TMP/fx.json" >/dev/null 2>&1 || bad "fixture dry-run failed"
ruby -rjson - "$TMP/fx.json" <<'RB' || fail=1
b = JSON.parse(File.read(ARGV[0]))
failed = false
chk = lambda do |cond, msg|
  puts((cond ? '  ok   ' : '  FAIL ') + msg)
  failed ||= !cond
end
types = b.map { |x| x['type'] }
chk.call(types == %w[heading_1 quote paragraph paragraph heading_2 bulleted_list_item bulleted_list_item table divider paragraph],
         "block sequence #{types.join(',')}")
q = b[1]['quote']['rich_text'].map { |r| r['text']['content'] }.join
chk.call(q == "quoted line one\nquoted line two", 'multi-line quote joined with newlines')
p1 = b[2]['paragraph']['rich_text']
chk.call(p1.first['annotations'] == { 'bold' => true } && p1.first['text']['content'] == 'Bold lead:', 'inline bold annotated')
chk.call(p1.any? { |r| r['annotations'] == { 'code' => true } && r['text']['content'] == 'code' }, 'inline code annotated')
chk.call(p1.map { |r| r['text']['content'] }.join.include?("\nsecond line"), 'hard break becomes a newline, trailing spaces stripped')
it = b[3]['paragraph']['rich_text']
chk.call(it.all? { |r| r['annotations'] == { 'italic' => true } } && it.first['text']['content'] == 'an italic note', 'underscore-wrapped note is italic')
chk.call(b[6]['bulleted_list_item']['rich_text'].any? { |r| r['annotations'] == { 'bold' => true } }, 'bold inside a bullet')
chk.call(b[6]['bulleted_list_item']['rich_text'].map { |r| r['text']['content'] }.join == 'bullet two wraps onto a continuation line', 'two-space continuation line folds into the bullet')
t = b[7]['table']
chk.call(t['table_width'] == 3 && t['children'].length == 4, "table 3 wide x 4 rows (header + 3), got #{t['table_width']}x#{t['children'].length}")
chk.call(t['children'].all? { |r| r['table_row']['cells'].length == 3 }, 'short row padded to header width')
cell = ->(r, c) { t['children'][r]['table_row']['cells'][c].map { |x| x['text']['content'] }.join }
chk.call(cell.call(2, 0) == 'a | pipe', 'escaped pipe restored inside a cell')
chk.call(cell.call(2, 1) == 'ends with \\', 'escaped backslash restored, row not shifted')
chk.call(cell.call(3, 0) == '-' && cell.call(3, 2) == '-', 'a data row of dashes is kept, not treated as a separator')
last = b.last['paragraph']['rich_text']
chk.call(last.length == 3 && last.map { |r| r['text']['content'].length } == [2000, 2000, 500], "4500-char run chunked to #{last.map { |r| r['text']['content'].length }.inspect}")
chk.call(last.map { |r| r['text']['content'] }.join.length == 4500, 'no characters lost in chunking')
exit(failed ? 1 : 0)
RB

echo "-- case 3: wide row refused --"
printf '| A | B |\n|---|---|\n| 1 | 2 | 3 |\n' > "$TMP/wide.md"
out=$(ruby "$PUB" --dry-run --input "$TMP/wide.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'Refusing to drop a cell' <<<"$out"; then ok "row wider than header is refused, not truncated"; else bad "wide row: rc=$rc $out"; fi

echo "-- case 4: >100 rich_text segments refused --"
ruby -e 'File.write(ARGV[0], ("`x` " * 120) + "\n")' "$TMP/segs.md"
out=$(ruby "$PUB" --dry-run --input "$TMP/segs.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'Refusing to publish a truncated page' <<<"$out"; then ok "120 inline segments refused, not sliced to 100"; else bad "segments: rc=$rc $out"; fi

echo "-- case 5: live mode without token --"
out=$(ruby "$PUB" --input "$TMP/fixture.md" --allow-unchecked-input 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'set NOTION_TOKEN' <<<"$out" && grep -q 'Nothing sent' <<<"$out"; then ok "aborts before any request when NOTION_TOKEN is unset"; else bad "token guard: rc=$rc $out"; fi

echo "-- case 6: missing input / empty body --"
out=$(ruby "$PUB" --dry-run --input "$TMP/nope.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'input not found' <<<"$out"; then ok "missing input aborts"; else bad "missing input: rc=$rc $out"; fi
: > "$TMP/empty.md"
out=$(ruby "$PUB" --dry-run --input "$TMP/empty.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'refusing to publish an empty page' <<<"$out"; then ok "empty body refused"; else bad "empty body: rc=$rc $out"; fi

echo "-- case 7: unchecked input needs the flag; bad page id aborts --"
out=$(NOTION_TOKEN=fake ruby "$PUB" --input "$TMP/fixture.md" 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'allow-unchecked-input' <<<"$out" && grep -q 'Nothing sent' <<<"$out"; then ok "non-default input without --allow-unchecked-input is refused"; else bad "unchecked guard: rc=$rc $out"; fi
out=$(ruby "$PUB" --dry-run --page-id not-a-page 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'not a Notion page id' <<<"$out"; then ok "malformed page id refused"; else bad "page id: rc=$rc $out"; fi

echo "-- case 8: equivalent path runs the drift guard, then the canary fires --"
out=$(NOTION_TOKEN=fake ruby "$PUB" --input ./audit-reports/notion/compliance-audit-page.md 2>&1); rc=$?
if [ $rc -ne 0 ] && grep -q 'compliance-notion-publish: OK' <<<"$out" && grep -qi 'connection refused\|ECONNREFUSED' <<<"$out"; then ok "drift guard ran on the equivalent path and the request hit the closed port"; else bad "equivalent path: rc=$rc $out"; fi

if [ $fail -eq 0 ]; then echo "compliance-notion-page-publish-test: PASS"; else echo "compliance-notion-page-publish-test: FAIL"; exit 1; fi
