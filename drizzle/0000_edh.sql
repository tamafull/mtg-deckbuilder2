PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mtg_cards (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  face_name TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  mana_cost TEXT,
  mana_value REAL NOT NULL DEFAULT 0,
  type_line TEXT,
  oracle_text TEXT,
  colors TEXT NOT NULL DEFAULT '[]',
  color_identity TEXT NOT NULL DEFAULT '[]',
  rarity TEXT,
  set_code TEXT,
  collector_number TEXT,
  scryfall_id TEXT,
  oracle_id TEXT,
  power TEXT,
  toughness TEXT,
  loyalty TEXT,
  legalities TEXT NOT NULL DEFAULT '{}',
  image_url TEXT,
  is_basic INTEGER NOT NULL DEFAULT 0,
  deck_limit INTEGER,
  normalized_name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mtg_cards_name ON mtg_cards(normalized_name);
CREATE INDEX IF NOT EXISTS idx_mtg_cards_set ON mtg_cards(set_code, collector_number);
CREATE INDEX IF NOT EXISTS idx_mtg_cards_oracle ON mtg_cards(oracle_id);
CREATE INDEX IF NOT EXISTS idx_mtg_cards_scryfall ON mtg_cards(scryfall_id);

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'commander',
  commander_uuid TEXT,
  partner_uuid TEXT,
  companion_uuid TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_decks_owner ON decks(owner_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS deck_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_uuid TEXT NOT NULL,
  card_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  zone TEXT NOT NULL DEFAULT 'main' CHECK(zone IN ('main','sideboard','commander','companion')),
  mana_cost TEXT,
  mana_value REAL NOT NULL DEFAULT 0,
  type_line TEXT,
  color_identity TEXT NOT NULL DEFAULT '[]',
  set_code TEXT,
  collector_number TEXT,
  scryfall_id TEXT,
  image_url TEXT,
  UNIQUE(deck_id, card_uuid, zone)
);
CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id, zone);

CREATE TABLE IF NOT EXISTS game_rooms (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  host_email TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),
  max_players INTEGER NOT NULL DEFAULT 4 CHECK(max_players BETWEEN 2 AND 4),
  game_state_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_rooms_invite ON game_rooms(invite_code);

CREATE TABLE IF NOT EXISTS room_players (
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  seat INTEGER NOT NULL CHECK(seat BETWEEN 1 AND 4),
  deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(room_id, email),
  UNIQUE(room_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_room_players_email ON room_players(email);

CREATE TABLE IF NOT EXISTS game_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  actor_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, version)
);
CREATE INDEX IF NOT EXISTS idx_game_actions_room ON game_actions(room_id, version DESC);
