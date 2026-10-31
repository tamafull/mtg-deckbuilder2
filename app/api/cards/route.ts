import { getDb, parseJson } from '@/lib/db';

export const runtime = 'edge';

type CardRow = {
  uuid: string; name: string; localized_name: string | null; localized_type_line: string | null;
  localized_oracle_text: string | null; localized_scryfall_id: string | null; localized_image_url: string | null;
  mana_cost: string | null; mana_value: number; type_line: string | null; oracle_text: string | null;
  colors: string; color_identity: string; rarity: string | null; set_code: string | null;
  collector_number: string | null; scryfall_id: string | null; oracle_id: string | null;
  power: string | null; toughness: string | null; loyalty: string | null; legalities: string;
  image_url: string | null; is_basic: number; deck_limit: number | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return Response.json({ cards: [] });
  const pattern = `%${q}%`;
  const prefix = `${q}%`;
  const db = getDb();
  const result = await db.prepare(`
    SELECT c.*,
      (SELECT n.name FROM mtg_card_names n WHERE n.card_uuid=c.uuid AND n.language='Japanese' ORDER BY n.id LIMIT 1) AS localized_name,
      (SELECT n.type_line FROM mtg_card_names n WHERE n.card_uuid=c.uuid AND n.language='Japanese' ORDER BY n.id LIMIT 1) AS localized_type_line,
      (SELECT n.oracle_text FROM mtg_card_names n WHERE n.card_uuid=c.uuid AND n.language='Japanese' ORDER BY n.id LIMIT 1) AS localized_oracle_text,
      (SELECT n.scryfall_id FROM mtg_card_names n WHERE n.card_uuid=c.uuid AND n.language='Japanese' ORDER BY n.id LIMIT 1) AS localized_scryfall_id,
      (SELECT n.image_url FROM mtg_card_names n WHERE n.card_uuid=c.uuid AND n.language='Japanese' ORDER BY n.id LIMIT 1) AS localized_image_url
    FROM mtg_cards c
    WHERE c.normalized_name LIKE ?1
       OR EXISTS (SELECT 1 FROM mtg_card_names s WHERE s.card_uuid=c.uuid AND s.normalized_name LIKE ?1)
    ORDER BY
      CASE
        WHEN EXISTS (SELECT 1 FROM mtg_card_names s WHERE s.card_uuid=c.uuid AND s.language='Japanese' AND s.normalized_name LIKE ?2) THEN 0
        WHEN c.normalized_name LIKE ?2 THEN 1
        ELSE 2
      END,
      COALESCE(localized_name, c.name) ASC,
      c.set_code DESC
    LIMIT 60
  `).bind(pattern, prefix).all<CardRow>();

  return Response.json({ cards: (result.results || []).map((c) => {
    const japaneseScryfallId = c.localized_scryfall_id || null;
    return {
      uuid: c.uuid,
      name: c.localized_name || c.name,
      englishName: c.name,
      language: c.localized_name ? 'Japanese' : 'English',
      manaCost: c.mana_cost || '',
      manaValue: Number(c.mana_value || 0),
      typeLine: c.localized_type_line || c.type_line || '',
      oracleText: c.localized_oracle_text || c.oracle_text || '',
      colors: parseJson<string[]>(c.colors, []),
      colorIdentity: parseJson<string[]>(c.color_identity, []),
      rarity: c.rarity,
      setCode: c.set_code,
      collectorNumber: c.collector_number,
      scryfallId: japaneseScryfallId || c.scryfall_id,
      oracleId: c.oracle_id,
      power: c.power,
      toughness: c.toughness,
      loyalty: c.loyalty,
      legalities: parseJson<Record<string, string>>(c.legalities, {}),
      isBasic: Boolean(c.is_basic),
      deckLimit: c.deck_limit,
      imageUrl: c.localized_image_url
        || (japaneseScryfallId ? `https://api.scryfall.com/cards/${japaneseScryfallId}?format=image&version=normal` : null)
        || c.image_url
        || (c.scryfall_id ? `https://api.scryfall.com/cards/${c.scryfall_id}?format=image&version=normal` : null),
    };
  }) });
}
