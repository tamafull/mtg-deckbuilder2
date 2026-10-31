ALTER TABLE mtg_card_names ADD COLUMN foreign_uuid TEXT;
ALTER TABLE mtg_card_names ADD COLUMN scryfall_id TEXT;
ALTER TABLE mtg_card_names ADD COLUMN multiverse_id TEXT;
ALTER TABLE mtg_card_names ADD COLUMN image_url TEXT;
CREATE INDEX IF NOT EXISTS idx_mtg_card_names_language ON mtg_card_names(language, normalized_name);
CREATE INDEX IF NOT EXISTS idx_mtg_card_names_scryfall ON mtg_card_names(scryfall_id);
