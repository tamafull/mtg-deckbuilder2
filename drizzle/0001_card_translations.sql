CREATE TABLE IF NOT EXISTS mtg_card_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_uuid TEXT NOT NULL REFERENCES mtg_cards(uuid) ON DELETE CASCADE,
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  type_line TEXT,
  oracle_text TEXT,
  UNIQUE(card_uuid, language, name)
);
CREATE INDEX IF NOT EXISTS idx_mtg_card_names_name ON mtg_card_names(normalized_name);
CREATE INDEX IF NOT EXISTS idx_mtg_card_names_card ON mtg_card_names(card_uuid, language);
