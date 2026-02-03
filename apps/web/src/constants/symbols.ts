export interface SymbolMeta {
  base: string;
  name: string;
  category: 'Major' | 'Altcoin' | 'Meme';
}

export const SYMBOL_META: Record<string, SymbolMeta> = {
  BTC: { base: 'BTC', name: 'Bitcoin', category: 'Major' },
  ETH: { base: 'ETH', name: 'Ethereum', category: 'Major' },
  BNB: { base: 'BNB', name: 'Binance Coin', category: 'Major' },
  SOL: { base: 'SOL', name: 'Solana', category: 'Major' },

  BCH: { base: 'BCH', name: 'Bitcoin Cash', category: 'Altcoin' },
  AVAX: { base: 'AVAX', name: 'Avalanche', category: 'Altcoin' },
  APT: { base: 'APT', name: 'Aptos', category: 'Altcoin' },
  ICP: { base: 'ICP', name: 'Internet Computer', category: 'Altcoin' },
  EGLD: { base: 'EGLD', name: 'MultiversX', category: 'Altcoin' },
  LTC: { base: 'LTC', name: 'Litecoin', category: 'Altcoin' },
  ATOM: { base: 'ATOM', name: 'Cosmos', category: 'Altcoin' },
  LINK: { base: 'LINK', name: 'Chainlink', category: 'Altcoin' },
  DOT: { base: 'DOT', name: 'Polkadot', category: 'Altcoin' },
  NEAR: { base: 'NEAR', name: 'NEAR Protocol', category: 'Altcoin' },
  FTM: { base: 'FTM', name: 'Fantom', category: 'Altcoin' },
  AXS: { base: 'AXS', name: 'Axie Infinity', category: 'Altcoin' },
  SUI: { base: 'SUI', name: 'Sui', category: 'Altcoin' },
  UNI: { base: 'UNI', name: 'Uniswap', category: 'Altcoin' },
  SAND: { base: 'SAND', name: 'The Sandbox', category: 'Altcoin' },
  APE: { base: 'APE', name: 'ApeCoin', category: 'Altcoin' },
  CHZ: { base: 'CHZ', name: 'Chiliz', category: 'Altcoin' },
  BLZ: { base: 'BLZ', name: 'Bluzelle', category: 'Altcoin' },
  ONE: { base: 'ONE', name: 'Harmony', category: 'Altcoin' },
  OSMO: { base: 'OSMO', name: 'Osmosis', category: 'Altcoin' },
  STI: { base: 'STI', name: 'Seek Tiger', category: 'Altcoin' },
  MINA: { base: 'MINA', name: 'Mina Protocol', category: 'Altcoin' },
  MATIC: { base: 'MATIC', name: 'Polygon', category: 'Altcoin' },
  TRX: { base: 'TRX', name: 'TRON', category: 'Altcoin' },

  DOGE: { base: 'DOGE', name: 'Dogecoin', category: 'Meme' },
  XRP: { base: 'XRP', name: 'Ripple', category: 'Altcoin' },
  ADA: { base: 'ADA', name: 'Cardano', category: 'Major' },
};
