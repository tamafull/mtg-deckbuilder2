import { getSiteUser } from '@/lib/auth';
import RoomClient from './room-client';

type Props={params:Promise<{id:string}>};

export default async function RoomPage({params}:Props){
  const user=await getSiteUser();
  const {id}=await params;
  if(!user)return <main className="signin panel"><h1>EDH Table</h1><p>通信対戦へ参加するにはChatGPTでログインしてください。</p><a className="btn primary" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/rooms/${id}`)}`}>Sign in with ChatGPT</a></main>;
  return <RoomClient roomId={id} displayName={user.displayName}/>;
}
