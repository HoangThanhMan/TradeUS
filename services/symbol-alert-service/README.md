# Trade-X Symbol Alert Service

Theo dõi sentiment alerts từ RabbitMQ và gửi cảnh báo cho người dùng đã đăng ký symbol.

## Tính năng

- Lắng nghe **sentiment alerts** từ `sentiment.exchange` (routing key `sentiment.alert.#`)
- Truy vấn **Symbol Subscription Service** để xác định ai đang theo dõi symbol
- Sử dụng **Redis cooldown** để tránh spam thông báo cho user
- Publish yêu cầu gửi email vào **Email Service** qua `email.exchange`

## Luồng hoạt động

```
Sentiment Service ──publish──▶ sentiment.exchange (sentiment.alert.BTCUSDT)
                                     │
                              Symbol Alert Service
                                     │
                        ┌────────────┼────────────┐
                        ▼            ▼             ▼
              Redis cooldown   Subscription    email.exchange
              (check/set)      Service (HTTP)  (publish email request)
```

## API (testing)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/alerts/trigger` | Trigger thủ công một alert |

## Cấu hình

| Biến môi trường | Mô tả | Mặc định |
|---|---|---|
| `RABBITMQ_URL` | RabbitMQ URL | `amqp://guest:guest@localhost:5672` |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` |
| `ALERT_COOLDOWN_SECONDS` | Thời gian giãn cách (giây) | `300` |
| `SUBSCRIPTION_SERVICE_URL` | URL của Subscription Service | `http://localhost:8005` |
| `PORT` | Cổng dịch vụ | `8004` |

## Chạy local

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8004
```
