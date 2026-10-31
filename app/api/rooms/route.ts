import { getDb } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';

export const runtime = 'edge';

function inviteCode() {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=new Uint8Array(8); crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');
}

export async function GET() {
  const user=await getSiteUser(); if(!user) return unauthorized();
  const result=await getDb().prepare(`SELECT r.id,r.invite_code AS inviteCode,r.name,r.status,r.max_players AS maxPlayers,r.updated_at AS updatedAt,
    COUNT(p2.email) AS playerCount
    FROM game_rooms r JOIN room_players mine ON mine.room_id=r.id AND mine.email=?1
    LEFT JOIN room_players p2 ON p2.room_id=r.id
    GROUP BY r.id ORDER BY r.updated_at DESC LIMIT 30`).bind(user.email).all();
  return Response.json({rooms:result.results||[]});
}

export async function POST(request:Request){
  const user=await getSiteUser(); if(!user) return unauthorized();
  const body=await request.json() as {name?:string;deckId?:string;maxPlayers?:number};
  const db=getDb(); const deckId=body.deckId||null;
  if(deckId){ const deck=await db.prepare('SELECT id FROM decks WHERE id=?1 AND owner_email=?2').bind(deckId,user.email).first(); if(!deck) return Response.json({error:'Deck not found.'},{status:400}); }
  const id=crypto.randomUUID(); const code=inviteCode(); const name=String(body.name||'EDH Table').trim().slice(0,80)||'EDH Table'; const maxPlayers=Math.max(2,Math.min(4,Number(body.maxPlayers||4)));
  await db.batch([
    db.prepare('INSERT INTO game_rooms(id,invite_code,host_email,name,max_players) VALUES(?1,?2,?3,?4,?5)').bind(id,code,user.email,name,maxPlayers),
    db.prepare('INSERT INTO room_players(room_id,email,display_name,seat,deck_id) VALUES(?1,?2,?3,1,?4)').bind(id,user.email,user.displayName,deckId),
  ]);
  return Response.json({id,inviteCode:code,name,maxPlayers},{status:201});
}
