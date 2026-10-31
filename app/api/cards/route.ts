import { getDb, parseJson } from '@/lib/db';

export const runtime = 'edge';

type CardRow = {
  uuid: string; name: string; localized_name: string | null; language: string | null;
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
  const db = getDb();
  const result = await db.prepare(`
    SELECT c.*, n.name AS localized_name, n.language
    FROM mtg_cards c
    LEFT JOIN mtg_card_names n ON n.card_uuid = c.uuid AND n.normalized_name LIKE ?1
    WHERE c.normalized_name LIKE ?1 OR n.normalized_name LIKE ?1
    GROUP BY c.uuid
    ORDER BY CASE WHEN c.normalized_name LIKE ?2 THEN 0 ELSE 1 END, c.name ASC, c.set_code DESC
    LIMIT 60
  `).bind(pattern, `${q}%`).all<CardRow>();

  return Response.json({ cards: (result.results || []).map((c) => ({
    uuid: c.uuid,
    name: c.localized_name || c.name,
    englishName: c.name,
    language: c.language || 'English',
    manaCost: c.mana_cost || '',
    manaValue: Number(c.mana_value || 0),
    typeLine: c.type_line || '',
    oracleText: c.oracle_text || '',
    colors: parseJson<string[]>(c.colors, []),
    colorIdentity: parseJson<string[]>(c.color_identity, []),
    rarity: c.rarity,
    setCode: c.set_code,
    collectorNumber: c.collector_number,
    scryfallId: c.scryfall_id,
    oracleId: c.oracle_id,
    power: c.power,
    toughness: c.toughness,
    loyalty: c.loyalty,
    legalities: parseJson<Record<string, string>>(c.legalities, {}),
    isBasic: Boolean(c.is_basic),
    deckLimit: c.deck_limit,
    imageUrl: c.image_url || (c.scryfall_id ? `https://api.scryfall.com/cards/${c.scryfall_id}?format=image&version=normal` : null),
  })) });
}
