# frozen_string_literal: true

# Markdown -> Notion block objects for the generated compliance posture page.
#
# Deliberately minimal: it covers exactly the Markdown that
# scripts/compliance-notion-publish.rb emits (h1/h2/h3, blockquotes, bullets,
# paragraphs, pipe tables, horizontal rules, inline **bold** and `code`) and
# nothing else. Anything outside that subset lands as a paragraph, never as an
# error, so a future generator change degrades visibly on the page rather than
# breaking the publish.
#
# Notion limits honoured here (https://developers.notion.com/reference/request-limits):
#   * 2000 characters per rich_text object -> long runs are chunked, never sliced.
#   * 100 rich_text objects per array -> exceeding it RAISES; nothing is truncated silently.
#   * table_row cells must all have table_width entries -> short rows are padded (lossless);
#     a row WIDER than its header RAISES, because dropping a cell would drop a finding title.
# The 100-children-per-append limit is the publisher's job, not the converter's.
#
# Pure stdlib. No network. Used by scripts/compliance-notion-page-publish.rb and
# exercised by scripts/tests/compliance-notion-page-publish-test.sh.
module NotionMarkdownBlocks
  MAX_CONTENT = 2000
  MAX_SEGMENTS = 100
  INLINE = /(\*\*[^*]+\*\*|`[^`]+`|[^*`]+|\*|`)/

  class LimitError < StandardError; end

  module_function

  # Inline Markdown -> array of Notion rich_text objects.
  def rich(text)
    out = []
    text.to_s.scan(INLINE) do |m|
      s = m[0]
      next if s.nil? || s.empty?

      if s.start_with?('**') && s.end_with?('**') && s.length > 4
        push_chunked(out, s[2..-3], { 'bold' => true })
      elsif s.start_with?('`') && s.end_with?('`') && s.length > 2
        push_chunked(out, s[1..-2], { 'code' => true })
      else
        push_chunked(out, s, nil)
      end
    end
    out = [{ 'type' => 'text', 'text' => { 'content' => '' } }] if out.empty?
    if out.length > MAX_SEGMENTS
      raise LimitError, "rich_text run has #{out.length} segments; Notion caps an array at #{MAX_SEGMENTS}. " \
                        'Refusing to publish a truncated page.'
    end
    out
  end

  # A whole run wrapped in single underscores (the generator's italic notes) -> italic.
  def rich_line(text)
    t = text.to_s
    if t.length > 2 && t.start_with?('_') && t.end_with?('_') && !t.include?("\n")
      rich(t[1..-2]).each { |r| (r['annotations'] ||= {})['italic'] = true }
    else
      rich(t)
    end
  end

  def push_chunked(out, content, annotations)
    remaining = content
    loop do
      chunk = remaining[0, MAX_CONTENT]
      obj = { 'type' => 'text', 'text' => { 'content' => chunk } }
      obj['annotations'] = annotations if annotations
      out << obj
      remaining = remaining[MAX_CONTENT..] || ''
      break if remaining.empty?
    end
  end

  # Split a pipe-table line into cells. A backslash escapes the next character, so the
  # generator's "\\|" (a pipe inside a title) and "\\\\" (a literal backslash, including one at
  # the end of a title) both survive as text instead of shifting the row.
  def cells(line)
    inner = line.strip.sub(/\A\|/, '').sub(/\|\z/, '')
    out = []
    cur = +''
    chars = inner.chars
    i = 0
    while i < chars.length
      ch = chars[i]
      if ch == '\\' && i + 1 < chars.length
        cur << chars[i + 1]; i += 2
      elsif ch == '|'
        out << cur; cur = +''; i += 1
      else
        cur << ch; i += 1
      end
    end
    out << cur
    out.map { |c| rich(c.strip) }
  end

  def table_separator?(line)
    line =~ /\A\|[\s:|-]+\|\z/
  end

  # Full Markdown text -> array of top-level Notion block objects.
  def convert(markdown)
    lines = markdown.lines.map(&:chomp)
    blocks = []
    i = 0
    while i < lines.length
      l = lines[i]
      if l.strip.empty?
        i += 1
      elsif l.start_with?('|')
        raw = []
        while i < lines.length && lines[i].start_with?('|')
          raw << lines[i]; i += 1
        end
        # Only the line right after the header is a separator; a data row of dashes is data.
        rows = raw.each_with_index.reject { |l2, n| n == 1 && table_separator?(l2) }.map(&:first)
        next if rows.empty?

        width = cells(rows.first).length
        padded = rows.each_with_index.map do |r, n|
          c = cells(r)
          if c.length > width
            raise LimitError, "table row #{n + 1} has #{c.length} cells but the header has #{width}: #{r[0, 80].inspect}. " \
                              'Refusing to drop a cell.'
          end
          c += Array.new(width - c.length) { rich('') } if c.length < width
          c
        end
        blocks << {
          'object' => 'block', 'type' => 'table',
          'table' => {
            'table_width' => width, 'has_column_header' => true, 'has_row_header' => false,
            'children' => padded.map { |c| { 'object' => 'block', 'type' => 'table_row', 'table_row' => { 'cells' => c } } }
          }
        }
      elsif l =~ /\A###\s+(.*)/
        blocks << heading('heading_3', Regexp.last_match(1)); i += 1
      elsif l =~ /\A##\s+(.*)/
        blocks << heading('heading_2', Regexp.last_match(1)); i += 1
      elsif l =~ /\A#\s+(.*)/
        blocks << heading('heading_1', Regexp.last_match(1)); i += 1
      elsif l.start_with?('> ') || l == '>'
        buf = []
        while i < lines.length && (lines[i].start_with?('> ') || lines[i] == '>')
          buf << lines[i].sub(/\A>\s?/, ''); i += 1
        end
        blocks << { 'object' => 'block', 'type' => 'quote', 'quote' => { 'rich_text' => rich(buf.join("\n")) } }
      elsif l.start_with?('- ')
        # The generator wraps long bullets with two-space continuation lines; fold them back.
        buf = [l[2..]]
        i += 1
        while i < lines.length && lines[i] =~ /\A  \S/
          buf << lines[i].strip; i += 1
        end
        blocks << { 'object' => 'block', 'type' => 'bulleted_list_item',
                    'bulleted_list_item' => { 'rich_text' => rich(buf.join(' ')) } }
      elsif l.strip == '---'
        blocks << { 'object' => 'block', 'type' => 'divider', 'divider' => {} }; i += 1
      else
        buf = []
        while i < lines.length && !lines[i].strip.empty? &&
              !lines[i].start_with?('|', '#', '> ', '- ') && lines[i].strip != '---' && lines[i] != '>'
          buf << lines[i]; i += 1
        end
        # Markdown hard breaks ("  " at end of line) become real line breaks on the page.
        blocks << { 'object' => 'block', 'type' => 'paragraph',
                    'paragraph' => { 'rich_text' => rich_line(buf.map { |b| b.sub(/\s+\z/, '') }.join("\n")) } }
      end
    end
    blocks
  end

  def heading(type, text)
    { 'object' => 'block', 'type' => type, type => { 'rich_text' => rich(text) } }
  end

  # One-line summary used by --dry-run output and the test harness.
  def summary(blocks)
    tables = blocks.select { |b| b['type'] == 'table' }
    types = blocks.map { |b| b['type'] }.tally
    {
      'blocks' => blocks.length,
      'types' => types,
      'tables' => tables.map { |t| "#{t['table']['table_width']}x#{t['table']['children'].length}" }
    }
  end
end
