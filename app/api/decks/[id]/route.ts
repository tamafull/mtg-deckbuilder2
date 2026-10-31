import { getDb, parseJson } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';

export const runtime = 'edge';

type Ctx = { params: Promise<{ id: string }> };
type CardInput = { uuid: string; name: string; quantity?: number; zone?: string; manaCost?: string; manaValue?: number; typeLine?: string; colorIdentity?: string[]; setCode?: string; collectorNumber?: string; scryfallId?: string; imageUrl?: string | null };
type Body = { name?: string; commanderUuid?: string | null; partnerUuid?: string | null; companionUuid?: string | null; notes?: string; cards?: CardInput[] };

async function ownedDeck(id: string, email: string) {
  return getDb().prepare('SELECT * FROM decks WHERE id=?1 AND owner_email=?2').bind(id, email).first<Record<string, unknown>>();
}

export async function GET(_request: Request, ctx: Ctx) {
  const user = await getSiteUser(); if (!user) return unauthorized();
  const { id } = await ctx.params; const deck = await ownedDeck(id, user.email);
  if (!deck) return Response.json({ error: 'Deck not found.' }, { status: 404 });
  const cards = await getDb().prepare(`SELECT card_uuid AS uuid, card_name AS name, quantity, zone,
      mana_cost AS manaCost, mana_value AS manaValue, type_line AS typeLine, color_identity AS colorIdentity,
      set_code AS setCode, collector_number AS collectorNumber, scryfall_id AS scryfallId, image_url AS imageUrl
      FROM deck_cards WHERE deck_id=?1 ORDER BY zone, mana_value, card_name`).bind(id).all<Record<string, unknown>>();
  return Response.json({ deck: {
    id: deck.id, name: deck.name, format: deck.format,
    commanderUuid: deck.commander_uuid, partnerUuid: deck.partner_uuid, companionUuid: deck.companion_uuid,
    notes: deck.notes, updatedAt: deck.updated_at,
    cards: (cards.results || []).map((c) => ({ ...c, colorIdentity: parseJson<string[]>(String(c.colorIdentity || '[]'), []) })),
  }});
}

export async function PUT(request: Request, ctx: Ctx) {
  const user = await getSiteUser(); if (!user) return unauthorized();
  const { id } = await ctx.params; if (!await ownedDeck(id, user.email)) return Response.json({ error: 'Deck not found.' }, { status: 404 });
  const body = await request.json() as Body; const db = getDb();
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE decks SET name=?1, commander_uuid=?2, partner_uuid=?3, companion_uuid=?4, notes=?5, updated_at=CURRENT_TIMESTAMP WHERE id=?6 AND owner_email=?7`)
      .bind(String(body.name || 'EDH Deck').trim().slice(0,120) || 'EDH Deck', body.commanderUuid || null, body.partnerUuid || null, body.companionUuid || null, String(body.notes || '').slice(0,5000), id, user.email),
    db.prepare('DELETE FROM deck_cards WHERE deck_id=?1').bind(id),
  ];
  for (const c of (Array.isArray(body.cards) ? body.cards.slice(0,300) : [])) {
    if (!c?.uuid || !c?.name) continue;
    const zone = ['main','sideboard','commander','companion'].includes(String(c.zone)) ? String(c.zone) : 'main';
    statements.push(db.prepare(`INSERT INTO deck_cards
      (deck_id, card_uuid, card_name, quantity, zone, mana_cost, mana_value, type_line, color_identity, set_code, collector_number, scryfall_id, image_url)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
      .bind(id,c.uuid,c.name,Math.max(1,Math.min(99,Number(c.quantity||1))),zone,c.manaCost||null,Number(c.manaValue||0),c.typeLine||null,JSON.stringify(c.colorIdentity||[]),c.setCode||null,c.collectorNumber||null,c.scryfallId||null,c.imageUrl||null));
  }
  await db.batch(statements); return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await getSiteUser(); if (!user) return unauthorized();
  const { id } = await ctx.params; const result = await getDb().prepare('DELETE FROM decks WHERE id=?1 AND owner_email=?2').bind(id,user.email).run();
  if (!result.meta.changes) return Response.json({ error: 'Deck not found.' }, { status: 404 });
  return Response.json({ ok: true });
}
