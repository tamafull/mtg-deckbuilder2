import { getDb } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';

export const runtime='edge';

export async function POST(request:Request){
  const user=await getSiteUser(); if(!user) return unauthorized();
  const body=await request.json() as {inviteCode?:string;deckId?:string}; const code=String(body.inviteCode||'').trim().toUpperCase();
  if(!code) return Response.json({error:'Invite code is required.'},{status:400});
  const db=getDb(); const room=await db.prepare('SELECT id,status,max_players AS maxPlayers FROM game_rooms WHERE invite_code=?1').bind(code).first<{id:string;status:string;maxPlayers:number}>();
  if(!room) return Response.json({error:'Room not found.'},{status:404});
  if(room.status!=='lobby') return Response.json({error:'Game already started.'},{status:409});
  if(body.deckId){ const d=await db.prepare('SELECT id FROM decks WHERE id=?1 AND owner_email=?2').bind(body.deckId,user.email).first(); if(!d) return Response.json({error:'Deck not found.'},{status:400}); }
  const existing=await db.prepare('SELECT seat FROM room_players WHERE room_id=?1 AND email=?2').bind(room.id,user.email).first<{seat:number}>();
  if(existing){ if(body.deckId) await db.prepare('UPDATE room_players SET deck_id=?1 WHERE room_id=?2 AND email=?3').bind(body.deckId,room.id,user.email).run(); return Response.json({id:room.id,seat:existing.seat}); }
  const seats=await db.prepare('SELECT seat FROM room_players WHERE room_id=?1 ORDER BY seat').bind(room.id).all<{seat:number}>();
  const used=new Set((seats.results||[]).map(s=>Number(s.seat))); let seat=0; for(let i=1;i<=room.maxPlayers;i++) if(!used.has(i)){seat=i;break;}
  if(!seat) return Response.json({error:'Room is full.'},{status:409});
  await db.prepare('INSERT INTO room_players(room_id,email,display_name,seat,deck_id) VALUES(?1,?2,?3,?4,?5)').bind(room.id,user.email,user.displayName,seat,body.deckId||null).run();
  return Response.json({id:room.id,seat});
}
