import { getDb, parseJson } from '@/lib/db';
import { getSiteUser, unauthorized } from '@/lib/auth';
import { applyAction, cardInstance, initialPlayer, type GameState, type GameCard } from '@/lib/game';

export const runtime='edge';
type Ctx={params:Promise<{id:string}>};
type PlayerRow={email:string;displayName:string;seat:number;deckId:string|null};
type DeckCardRow={uuid:string;name:string;quantity:number;zone:string;typeLine:string|null;imageUrl:string|null;scryfallId:string|null};

async function buildInitialState(roomId:string,db:D1Database):Promise<GameState>{
  const playersResult=await db.prepare('SELECT email,display_name AS displayName,seat,deck_id AS deckId FROM room_players WHERE room_id=?1 ORDER BY seat').bind(roomId).all<PlayerRow>();
  const players=playersResult.results||[];if(players.length<2)throw new Error('NEED_PLAYERS');
  const state:GameState={started:true,turn:1,activeSeat:players[0].seat,phase:'opening hand',players:{},log:['EDH game started']};
  for(const p of players){
    if(!p.deckId)throw new Error(`NO_DECK:${p.displayName}`);
    const deck=await db.prepare('SELECT id FROM decks WHERE id=?1 AND owner_email=?2').bind(p.deckId,p.email).first();if(!deck)throw new Error(`INVALID_DECK:${p.displayName}`);
    const cardsResult=await db.prepare(`SELECT card_uuid AS uuid,card_name AS name,quantity,zone,type_line AS typeLine,image_url AS imageUrl,scryfall_id AS scryfallId FROM deck_cards WHERE deck_id=?1`).bind(p.deckId).all<DeckCardRow>();
    const rows=cardsResult.results||[];const total=rows.filter(r=>r.zone==='main'||r.zone==='commander').reduce((n,r)=>n+Number(r.quantity),0);const commanderCount=rows.filter(r=>r.zone==='commander').reduce((n,r)=>n+Number(r.quantity),0);
    if(total!==100)throw new Error(`DECK_SIZE:${p.displayName}:${total}`);if(commanderCount<1||commanderCount>2)throw new Error(`COMMANDER_COUNT:${p.displayName}:${commanderCount}`);
    const library:GameCard[]=[];const command:GameCard[]=[];
    for(const r of rows){const image=r.imageUrl||(r.scryfallId?`https://api.scryfall.com/cards/${r.scryfallId}?format=image&version=normal`:null);for(let i=0;i<Number(r.quantity);i++){const c=cardInstance({uuid:r.uuid,name:r.name,imageUrl:image,typeLine:r.typeLine},r.zone==='commander');if(r.zone==='main')library.push(c);else if(r.zone==='commander')command.push(c);}}
    state.players[p.email]=initialPlayer(p.email,p.displayName,Number(p.seat),library,command);
  }
  return state;
}

function actionError(message:string){
  if(message==='NEED_PLAYERS')return '2人以上参加してから開始してください。';
  if(message.startsWith('NO_DECK:'))return `${message.split(':')[1]} がデッキを選択していません。`;
  if(message.startsWith('INVALID_DECK:'))return `${message.split(':')[1]} のデッキを読み込めません。`;
  if(message.startsWith('DECK_SIZE:')){const[,name,count]=message.split(':');return `${name} のデッキが100枚ではありません（${count}枚）。`;}
  if(message.startsWith('COMMANDER_COUNT:'))return `${message.split(':')[1]} の統率者設定を確認してください。`;
  return message;
}

export async function POST(request:Request,ctx:Ctx){
  const user=await getSiteUser();if(!user)return unauthorized();const{id}=await ctx.params;const body=await request.json() as {type?:string;version?:number;[key:string]:unknown};const db=getDb();
  const member=await db.prepare('SELECT seat FROM room_players WHERE room_id=?1 AND email=?2').bind(id,user.email).first();if(!member)return Response.json({error:'Not in room.'},{status:403});
  const room=await db.prepare('SELECT host_email AS hostEmail,status,game_state_json AS stateJson,version FROM game_rooms WHERE id=?1').bind(id).first<{hostEmail:string;status:string;stateJson:string;version:number}>();if(!room)return Response.json({error:'Room not found.'},{status:404});
  const expected=Number.isFinite(Number(body.version))?Number(body.version):Number(room.version);
  try{
    if(body.type==='start'){
      if(room.hostEmail!==user.email)return Response.json({error:'Only the host can start.'},{status:403});if(room.status!=='lobby')return Response.json({error:'Game already started.'},{status:409});
      const state=await buildInitialState(id,db);const next=Number(room.version)+1;
      const result=await db.prepare(`UPDATE game_rooms SET status='playing',game_state_json=?1,version=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND version=?4`).bind(JSON.stringify(state),next,id,Number(room.version)).run();
      if(!result.meta.changes)return Response.json({error:'State changed. Retry.'},{status:409});
      await db.prepare('INSERT INTO game_actions(room_id,version,actor_email,action_type,payload_json) VALUES(?1,?2,?3,?4,?5)').bind(id,next,user.email,'start','{}').run();return Response.json({ok:true,version:next});
    }
    if(room.status!=='playing')return Response.json({error:'Game is not active.'},{status:409});if(expected!==Number(room.version))return Response.json({error:'State changed.',version:room.version},{status:409});
    const state=parseJson<GameState>(room.stateJson,{started:false,turn:1,activeSeat:1,phase:'',players:{},log:[]});applyAction(state,user.email,body);
    if(Object.values(state.players).filter(p=>!p.conceded).length<=1)room.status='finished';
    const next=Number(room.version)+1;const result=await db.prepare('UPDATE game_rooms SET status=?1,game_state_json=?2,version=?3,updated_at=CURRENT_TIMESTAMP WHERE id=?4 AND version=?5').bind(room.status,JSON.stringify(state),next,id,Number(room.version)).run();
    if(!result.meta.changes)return Response.json({error:'State changed. Retry.'},{status:409});
    const payload={...body};delete payload.version;await db.prepare('INSERT INTO game_actions(room_id,version,actor_email,action_type,payload_json) VALUES(?1,?2,?3,?4,?5)').bind(id,next,user.email,String(body.type||''),JSON.stringify(payload)).run();return Response.json({ok:true,version:next,status:room.status});
  }catch(e){const message=e instanceof Error?e.message:'Invalid action';return Response.json({error:actionError(message)},{status:400});}
}
