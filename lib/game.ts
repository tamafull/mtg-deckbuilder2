export type GameCard={instanceId:string;uuid:string;name:string;imageUrl:string|null;typeLine:string;zoneCard:boolean;tapped:boolean;counters:Record<string,number>};
export type PlayerGameState={email:string;displayName:string;seat:number;life:number;library:GameCard[];hand:GameCard[];battlefield:GameCard[];graveyard:GameCard[];exile:GameCard[];command:GameCard[];peek:GameCard[];mulligans:number;conceded:boolean;commanderDamage:Record<string,number>};
export type GameState={started:boolean;turn:number;activeSeat:number;phase:string;players:Record<string,PlayerGameState>;log:string[]};

export function shuffle<T>(input:T[]):T[]{const a=[...input];const values=new Uint32Array(Math.max(1,a.length));crypto.getRandomValues(values);for(let i=a.length-1;i>0;i--){const j=values[i%values.length]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function cardInstance(row:{uuid:string;name:string;imageUrl?:string|null;typeLine?:string|null},zoneCard=false):GameCard{return{instanceId:crypto.randomUUID(),uuid:row.uuid,name:row.name,imageUrl:row.imageUrl||null,typeLine:row.typeLine||'',zoneCard,tapped:false,counters:{}};}
export function initialPlayer(email:string,displayName:string,seat:number,library:GameCard[],command:GameCard[]):PlayerGameState{const shuffled=shuffle(library);return{email,displayName,seat,life:40,library:shuffled.slice(7),hand:shuffled.slice(0,7),battlefield:[],graveyard:[],exile:[],command,peek:[],mulligans:0,conceded:false,commanderDamage:{}};}

function findCard(p:PlayerGameState,zone:string,id:string){const list=(p as unknown as Record<string,unknown>)[zone];if(!Array.isArray(list))return null;const i=(list as GameCard[]).findIndex(c=>c.instanceId===id);return i<0?null:{list:list as GameCard[],index:i,card:(list as GameCard[])[i]};}
function log(state:GameState,text:string){state.log=[text,...state.log].slice(0,80);}
export function applyAction(state:GameState,email:string,action:{type:string;[key:string]:unknown}){
  const p=state.players[email];if(!p)throw new Error('NOT_IN_ROOM');
  const type=String(action.type||'');
  if(type==='draw'){const count=Math.max(1,Math.min(10,Number(action.count||1)));for(let i=0;i<count;i++){const c=p.library.shift();if(c)p.hand.push(c);}p.peek=[];log(state,`${p.displayName} が${count}枚ドロー`);}
  else if(type==='mulligan'){p.library=shuffle([...p.library,...p.hand]);p.hand=p.library.splice(0,7);p.mulligans++;p.peek=[];log(state,`${p.displayName} がマリガン (${p.mulligans})`);}
  else if(type==='bottom'){const hit=findCard(p,'hand',String(action.instanceId||''));if(!hit)throw new Error('CARD_NOT_FOUND');const[c]=hit.list.splice(hit.index,1);p.library.push(c);p.peek=[];}
  else if(type==='shuffle'){p.library=shuffle(p.library);p.peek=[];log(state,`${p.displayName} がライブラリーをシャッフル`);}
  else if(type==='peek_top'){p.peek=p.library.slice(0,Math.max(1,Math.min(10,Number(action.count||1))));}
  else if(type==='clear_peek'){p.peek=[];}
  else if(type==='move'){
    const from=String(action.from||''),to=String(action.to||'');const allowed=new Set(['hand','battlefield','graveyard','exile','command']);if(!allowed.has(from)||!allowed.has(to))throw new Error('INVALID_ZONE');
    const hit=findCard(p,from,String(action.instanceId||''));if(!hit)throw new Error('CARD_NOT_FOUND');const[c]=hit.list.splice(hit.index,1);c.tapped=false;(p as unknown as Record<string,GameCard[]>)[to].push(c);log(state,`${p.displayName}: ${c.name} → ${to}`);
  }
  else if(type==='tap'){const hit=findCard(p,'battlefield',String(action.instanceId||''));if(!hit)throw new Error('CARD_NOT_FOUND');hit.card.tapped=typeof action.tapped==='boolean'?Boolean(action.tapped):!hit.card.tapped;}
  else if(type==='counter'){const hit=findCard(p,'battlefield',String(action.instanceId||''));if(!hit)throw new Error('CARD_NOT_FOUND');const name=String(action.name||'+1/+1').slice(0,30);hit.card.counters[name]=Math.max(0,(hit.card.counters[name]||0)+Math.max(-99,Math.min(99,Number(action.delta||1))));if(!hit.card.counters[name])delete hit.card.counters[name];}
  else if(type==='life'){p.life=Math.max(-999,Math.min(999,p.life+Math.max(-100,Math.min(100,Number(action.delta||0)))));}
  else if(type==='commander_damage'){const seat=String(Math.max(1,Math.min(4,Number(action.attackerSeat||1))));p.commanderDamage[seat]=Math.max(0,Math.min(99,(p.commanderDamage[seat]||0)+Math.max(-21,Math.min(21,Number(action.delta||0)))));}
  else if(type==='token'){const name=String(action.name||'Token').trim().slice(0,60)||'Token';p.battlefield.push({instanceId:crypto.randomUUID(),uuid:`token:${crypto.randomUUID()}`,name,imageUrl:null,typeLine:'Token',zoneCard:false,tapped:false,counters:{}});log(state,`${p.displayName} が${name}トークンを生成`);}
  else if(type==='concede'){p.conceded=true;log(state,`${p.displayName} が投了`);}
  else if(type==='next_turn'){const active=Object.values(state.players).filter(x=>!x.conceded).sort((a,b)=>a.seat-b.seat);if(active.length){const i=active.findIndex(x=>x.seat===state.activeSeat);const next=active[(i+1+active.length)%active.length];if(next.seat<=state.activeSeat)state.turn++;state.activeSeat=next.seat;for(const c of next.battlefield)c.tapped=false;const drawn=next.library.shift();if(drawn)next.hand.push(drawn);state.phase='untap/upkeep/draw';log(state,`Turn ${state.turn}: ${next.displayName}`);}}
  else if(type==='phase'){state.phase=String(action.phase||'main').slice(0,40);}
  else throw new Error('UNKNOWN_ACTION');
}

export function viewFor(state:GameState,email:string){return{started:state.started,turn:state.turn,activeSeat:state.activeSeat,phase:state.phase,log:state.log,players:Object.values(state.players).sort((a,b)=>a.seat-b.seat).map(p=>({displayName:p.displayName,seat:p.seat,isSelf:p.email===email,life:p.life,libraryCount:p.library.length,handCount:p.hand.length,hand:p.email===email?p.hand:undefined,peek:p.email===email?p.peek:undefined,battlefield:p.battlefield,graveyard:p.graveyard,exile:p.exile,command:p.command,mulligans:p.mulligans,conceded:p.conceded,commanderDamage:p.commanderDamage}))};}
