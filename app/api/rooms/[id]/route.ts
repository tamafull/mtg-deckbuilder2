import { getDb, parseJson } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';
import { viewFor, type GameState } from '@/lib/game';

export const runtime='edge';
type Ctx={params:Promise<{id:string}>};
type LobbyPlayer={email:string;displayName:string;seat:number;deckId:string|null};

export async function GET(_request:Request,ctx:Ctx){
  const user=await getSiteUser();if(!user)return unauthorized();const{id}=await ctx.params;const db=getDb();
  const membership=await db.prepare('SELECT seat,deck_id AS deckId FROM room_players WHERE room_id=?1 AND email=?2').bind(id,user.email).first();
  if(!membership)return Response.json({error:'Room not found or not joined.'},{status:404});
  const room=await db.prepare('SELECT id,invite_code AS inviteCode,host_email AS hostEmail,name,status,max_players AS maxPlayers,game_state_json AS gameState,version FROM game_rooms WHERE id=?1').bind(id).first<Record<string,unknown>>();
  if(!room)return Response.json({error:'Room not found.'},{status:404});
  const players=await db.prepare('SELECT email,display_name AS displayName,seat,deck_id AS deckId FROM room_players WHERE room_id=?1 ORDER BY seat').bind(id).all<LobbyPlayer>();
  const safePlayers=(players.results||[]).map(p=>({displayName:p.displayName,seat:Number(p.seat),deckId:p.deckId,isSelf:p.email===user.email}));
  const state=parseJson<GameState>(String(room.gameState||'{}'),{started:false,turn:1,activeSeat:1,phase:'lobby',players:{},log:[]});
  return Response.json({room:{id:room.id,inviteCode:room.inviteCode,name:room.name,status:room.status,maxPlayers:room.maxPlayers,version:room.version,isHost:room.hostEmail===user.email,players:safePlayers,game:room.status==='playing'||room.status==='finished'?viewFor(state,user.email):null}});
}

export async function DELETE(_request:Request,ctx:Ctx){
  const user=await getSiteUser();if(!user)return unauthorized();const{id}=await ctx.params;const db=getDb();
  const result=await db.prepare('DELETE FROM game_rooms WHERE id=?1 AND host_email=?2').bind(id,user.email).run();
  if(!result.meta.changes)return Response.json({error:'Only the host can delete this room.'},{status:403});
  return Response.json({ok:true});
}
