export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  services: {
    userService: process.env.USER_SERVICE_URL || 'http://localhost:3010',
    sentimentService: process.env.SENTIMENT_SERVICE_URL || 'http://localhost:8001',
    predictionService: process.env.PREDICTION_SERVICE_URL || 'http://localhost:8002',
  },
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },
});
