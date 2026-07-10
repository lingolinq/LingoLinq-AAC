class AddArticle50MarkerToAiFocusWordSets < ActiveRecord::Migration[7.2]
  # EU AI Act Article 50(2): store the machine-readable marker for an AI-generated
  # focus-word list, mirroring board.settings['ai_generated']. Nullable, no backfill:
  # an absent marker reads as "not marked" (a curated/workshop set, or a set generated
  # before this column existed), consistent with the board-generation marking approach.
  def change
    add_column :ai_focus_word_sets, :ai_generated, :text
  end
end
