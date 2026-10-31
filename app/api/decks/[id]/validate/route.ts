import { getDb, parseJson } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';

export const runtime = 'edge';
type Ctx = { params: Promise<{ id: string }> };
type Row = { card_uuid:string; card_name:string; quantity:number; zone:string; type_line:string|null; color_identity:string; is_basic:number|null; deck_limit:number|null; oracle_id:string|null; oracle_text:string|null; legalities:string|null };

const COLORS = ['W','U','B','R','G'] as const;

export async function GET(_request: Request, ctx: Ctx) {
  const user = await getSiteUser(); if (!user) return unauthorized();
  const { id } = await ctx.params; const db = getDb();
  const deck = await db.prepare('SELECT id FROM decks WHERE id=?1 AND owner_email=?2').bind(id,user.email).first();
  if (!deck) return Response.json({ error:'Deck not found.' }, { status:404 });
  const result = await db.prepare(`SELECT dc.card_uuid,dc.card_name,dc.quantity,dc.zone,COALESCE(c.type_line,dc.type_line) type_line,
      COALESCE(c.color_identity,dc.color_identity) color_identity,c.is_basic,c.deck_limit,c.oracle_id,c.oracle_text,c.legalities
      FROM deck_cards dc LEFT JOIN mtg_cards c ON c.uuid=dc.card_uuid WHERE dc.deck_id=?1`).bind(id).all<Row>();
  const rows = result.results || []; const errors:string[]=[]; const warnings:string[]=[];
  const commanders = rows.filter(r=>r.zone==='commander');
  const total = rows.filter(r=>r.zone==='main'||r.zone==='commander').reduce((n,r)=>n+Number(r.quantity),0);
  if (total !== 100) errors.push(`Commanderデッキは統率者を含めて100枚です（現在${total}枚）。`);
  const commanderCount = commanders.reduce((n,r)=>n+Number(r.quantity),0);
  if (commanderCount < 1 || commanderCount > 2) errors.push('統率者は通常1枚、Partner等を使う場合のみ2枚です。');
  for (const c of commanders) {
    const type = c.type_line || ''; const text = c.oracle_text || '';
    if (!/Legendary\s+Creature/i.test(type) && !/can be your commander/i.test(text)) warnings.push(`${c.card_name}: 統率者に指定可能かカードテキストを確認してください。`);
  }
  if (commanderCount === 2) {
    const texts = commanders.map(c => `${c.type_line||''}\n${c.oracle_text||''}`);
    const partner = texts.every(t=>/\bPartner\b/i.test(t));
    const background = texts.some(t=>/Choose a Background/i.test(t)) && texts.some(t=>/Background/i.test(t));
    const doctor = texts.some(t=>/Doctor's companion/i.test(t)) && texts.some(t=>/Time Lord Doctor/i.test(t));
    if (!partner && !background && !doctor) warnings.push('2枚の統率者の組み合わせ（Partner / Background / Doctor等）が合法か確認してください。');
  }
  const commanderIdentity = new Set<string>();
  for (const c of commanders) for (const color of parseJson<string[]>(c.color_identity,[])) commanderIdentity.add(color);
  for (const r of rows.filter(r=>r.zone==='main')) {
    for (const color of parseJson<string[]>(r.color_identity,[])) if (!commanderIdentity.has(color)) errors.push(`${r.card_name}: 統率者の固有色に含まれない${color}を含みます。`);
  }
  const grouped = new Map<string,{name:string;qty:number;basic:boolean;limit:number}>();
  for (const r of rows.filter(r=>r.zone==='main'||r.zone==='commander')) {
    const key = r.oracle_id || r.card_name.toLowerCase(); const current = grouped.get(key) || {name:r.card_name,qty:0,basic:Boolean(r.is_basic)||/Basic Land/i.test(r.type_line||''),limit:Number(r.deck_limit||1)};
    current.qty += Number(r.quantity); current.limit = Math.max(current.limit,Number(r.deck_limit||1)); grouped.set(key,current);
  }
  for (const x of grouped.values()) if (!x.basic && x.qty > x.limit) errors.push(`${x.name}: 同名カードは${x.limit}枚までです（現在${x.qty}枚）。`);
  for (const r of rows) {
    const legality = parseJson<Record<string,string>>(r.legalities,{}).commander;
    if (legality && !/^legal$/i.test(legality)) errors.push(`${r.card_name}: Commanderで${legality}です。`);
  }
  const side = rows.filter(r=>r.zone==='sideboard').reduce((n,r)=>n+Number(r.quantity),0);
  if (side) warnings.push(`Commanderでは通常サイドボードを使用しません（現在${side}枚）。`);
  return Response.json({ valid: errors.length===0, total, commanderCount, colorIdentity: COLORS.filter(c=>commanderIdentity.has(c)), errors:[...new Set(errors)], warnings:[...new Set(warnings)] });
}
