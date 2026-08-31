# frozen_string_literal: true

# Notion API rich_text helper for the register -> Notion sync scripts.
#
# Notion caps each rich_text object's `text.content` at 2000 characters
# (https://developers.notion.com/reference/request-limits). A property value
# is an array of those objects (max 100), so text longer than 2000 must be
# split rather than sliced. The previous single-slice `t[0, 1900]` silently
# dropped the tail of counsel-length remediations (LL-b3e3a0b99c on PR #879).
module NotionRichText
  # Stay under Notion's 2000-char cap with the same 100-char margin the
  # sync scripts originally used.
  MAX_CONTENT = 1900
  MAX_SEGMENTS = 100

  def self.rich(text)
    t = text.to_s
    return [] if t.empty?

    chunks = []
    remaining = t
    while !remaining.empty? && chunks.size < MAX_SEGMENTS
      chunks << remaining[0, MAX_CONTENT]
      remaining = remaining[MAX_CONTENT..] || ''
    end
    chunks.map { |chunk| { 'text' => { 'content' => chunk } } }
  end
end
