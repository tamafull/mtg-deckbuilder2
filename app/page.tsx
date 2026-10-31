import { getSiteUser } from '@/lib/auth';
import HomeClient from './home-client';

export default async function Page(){
  const user=await getSiteUser();
  if(!user)return <main className="signin panel"><h1>MTG EDH Deckbuilder</h1><p>MTGJSONをカードマスタにしたCommander専用デッキビルダーです。デッキ保存と通信対戦を使うにはChatGPTでログインしてください。</p><a className="btn primary" href="/signin-with-chatgpt?return_to=%2F">Sign in with ChatGPT</a></main>;
  return <HomeClient user={user}/>;
}
