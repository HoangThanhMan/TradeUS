export interface SymbolMeta {
  base: string;
  name: string;
  category: 'Major' | 'Altcoin' | 'Meme';
}

export const SYMBOL_META: Record<string, SymbolMeta> = {
  BTC: {
    base: 'BTC',
    name: 'Bitcoin',
    category: 'Major',
  },
  ETH: {
    base: 'ETH',
    name: 'Ethereum',
    category: 'Major',
  },
  BNB: {
    base: 'BNB',
    name: 'Binance Coin',
    category: 'Major',
  },
  SOL: {
    base: 'SOL',
    name: 'Solana',
    category: 'Major',
  },
  ADA: {
    base: 'ADA',
    name: 'Cardano',
    category: 'Major',
  },
};
