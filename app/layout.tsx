import type { ReactNode } from 'react';
import './globals.css';

export const metadata={title:'MTG EDH Deckbuilder',description:'MTGJSON powered Commander deck builder and multiplayer table'};

export default function RootLayout({children}:{children:ReactNode}){
  return <html lang="ja"><body>{children}</body></html>;
}
