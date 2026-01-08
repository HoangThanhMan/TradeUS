/**
 * Test Consumer - Kiểm tra dữ liệu trong RabbitMQ
 * Chạy: npx ts-node src/test-consumer.ts
 */

import amqp from 'amqplib';

const RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'tradex.prices';
const ROUTING_KEY_PATTERN = 'price.#'; // Nhận tất cả messages với prefix 'price.'

async function startConsumer() {
  try {
    console.log('🔌 Connecting to RabbitMQ...');
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Tạo queue tạm thời (auto-delete khi consumer disconnect)
    const { queue } = await channel.assertQueue('', { 
      exclusive: true,
      autoDelete: true 
    });

    console.log(`📦 Created temporary queue: ${queue}`);

    // Bind queue tới exchange với routing key pattern
    await channel.bindQueue(queue, EXCHANGE, ROUTING_KEY_PATTERN);
    console.log(`🔗 Bound to exchange "${EXCHANGE}" with pattern "${ROUTING_KEY_PATTERN}"`);
    console.log('');
    console.log('📡 Waiting for messages... (Press Ctrl+C to exit)');
    console.log('='.repeat(60));

    let messageCount = 0;

    // Consume messages
    await channel.consume(queue, (msg) => {
      if (msg) {
        messageCount++;
        const content = JSON.parse(msg.content.toString());
        const routingKey = msg.fields.routingKey;

        console.log(`\n📨 Message #${messageCount} [${routingKey}]`);
        console.log(`   Symbol: ${content.symbol}`);
        console.log(`   Price: ${content.close}`);
        console.log(`   Volume: ${content.volume}`);
        console.log(`   Time: ${new Date(content.timestamp).toLocaleString()}`);
        
        if (content.dataType === 'historical') {
          console.log(`   Type: Historical Data`);
          console.log(`   Interval: ${content.interval}`);
          console.log(`   Candles: ${content.count}`);
        } else {
          console.log(`   Type: Realtime`);
          console.log(`   Source: ${content.source}`);
        }

        channel.ack(msg);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down consumer...');
      console.log(`📊 Total messages received: ${messageCount}`);
      await channel.close();
      await connection.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

startConsumer();
