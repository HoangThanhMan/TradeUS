import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  nodeEnv: string;
  logLevel: string;
  binance: {
    wsUrl: string;
    symbols: string[];
    streamType: string;
  };
  rabbitmq: {
    url: string;
    exchange: string;
    exchangeType: string;
    routingKeyPrefix: string;
  };
  reconnect: {
    intervalMs: number;
    maxAttempts: number;
  };
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  binance: {
    wsUrl: process.env.BINANCE_WS_URL || 'wss://fstream.binance.com/stream',
    symbols: (process.env.BINANCE_SYMBOLS || 'btcusdt,ethusdt,bnbusdt,solusdt,bchusdt,avaxusdt,aptusdt,icpusdt,egldusdt,ltcusdt,atomusdt,linkusdt,dotusdt,nearusdt,ftmusdt,axsusdt,suiusdt,uniusdt,sandusdt,apeusdt,chzusdt,blzusdt,oneusdt,osmosdusdt,stiusdt,minaustdt,maticusdt,trxusdt,dogeusdt,xrpusdt,adausdt').split(',').map(s => s.trim().toLowerCase()),
    streamType: process.env.BINANCE_STREAM_TYPE || 'miniTicker',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'tradex.prices',
    exchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || 'topic',
    routingKeyPrefix: process.env.RABBITMQ_ROUTING_KEY_PREFIX || 'price',
  },
  reconnect: {
    intervalMs: parseInt(process.env.RECONNECT_INTERVAL_MS || '5000', 10),
    maxAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '10', 10),
  },
};

export default config;
