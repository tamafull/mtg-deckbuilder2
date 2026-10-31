import { getDb } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';

export const runtime = 'edge';

type DeckCardInput = {
  uuid: string; name: string; quantity?: number; zone?: 'main'|'sideboard'|'commander'|'companion';
  manaCost?: string; manaValue?: number; typeLine?: string; colorIdentity?: string[];
  setCode?: string; collectorNumber?: string; scryfallId?: string; imageUrl?: string | null;
};

type DeckInput = {
  name?: string; format?: string; commanderUuid?: string | null; partnerUuid?: string | null;
  companionUuid?: string | null; notes?: string; cards?: DeckCardInput[];
};

export async function GET() {
  const user = await getSiteUser();
  if (!user) return unauthorized();
  const db = getDb();
  const result = await db.prepare(`
    SELECT d.id, d.name, d.format, d.commander_uuid AS commanderUuid, d.partner_uuid AS partnerUuid,
           d.companion_uuid AS companionUuid, d.updated_at AS updatedAt,
           COALESCE(SUM(CASE WHEN dc.zone IN ('main','commander') THEN dc.quantity ELSE 0 END),0) AS cardCount
    FROM decks d LEFT JOIN deck_cards dc ON dc.deck_id = d.id
    WHERE d.owner_email = ?1
    GROUP BY d.id ORDER BY d.updated_at DESC
  `).bind(user.email).all();
  return Response.json({ decks: result.results || [] });
}

export async function POST(request: Request) {
  const user = await getSiteUser();
  if (!user) return unauthorized();
  const body = await request.json() as DeckInput;
  const id = crypto.randomUUID();
  const name = String(body.name || '新しいEDHデッキ').trim().slice(0, 120) || '新しいEDHデッキ';
  const format = body.format === 'commander' ? 'commander' : 'commander';
  const cards = Array.isArray(body.cards) ? body.cards.slice(0, 300) : [];
  const db = getDb();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO decks (id, owner_email, name, format, commander_uuid, partner_uuid, companion_uuid, notes)
                VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
      .bind(id, user.email, name, format, body.commanderUuid || null, body.partnerUuid || null, body.companionUuid || null, String(body.notes || '').slice(0, 5000)),
  ];
  for (const c of cards) {
    if (!c?.uuid || !c?.name) continue;
    statements.push(db.prepare(`INSERT INTO deck_cards
      (deck_id, card_uuid, card_name, quantity, zone, mana_cost, mana_value, type_line, color_identity, set_code, collector_number, scryfall_id, image_url)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
      .bind(id, c.uuid, c.name, Math.max(1, Math.min(99, Number(c.quantity || 1))), c.zone || 'main', c.manaCost || null,
        Number(c.manaValue || 0), c.typeLine || null, JSON.stringify(c.colorIdentity || []), c.setCode || null,
        c.collectorNumber || null, c.scryfallId || null, c.imageUrl || null));
  }
  await db.batch(statements);
  return Response.json({ id, name, format }, { status: 201 });
}
