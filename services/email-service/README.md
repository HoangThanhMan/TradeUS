# Trade-X Email Service

Dịch vụ gửi email bất đồng bộ cho hệ thống Trade-X.

## Tính năng

- Nhận yêu cầu gửi email qua **RabbitMQ** (queue `email.send.queue`)
- Áp dụng **Strategy Pattern** để linh hoạt thay đổi nhà cung cấp email
  - `SmtpEmailStrategy` – gửi email thật qua SMTP
  - `ConsoleEmailStrategy` – in ra console (dùng khi phát triển)
- REST API `/api/email/send` để gửi email thủ công (testing)

## Cấu hình

| Biến môi trường | Mô tả | Mặc định |
|---|---|---|
| `EMAIL_STRATEGY` | `smtp` hoặc `console` | `console` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USERNAME` | Tài khoản SMTP | |
| `SMTP_PASSWORD` | Mật khẩu SMTP | |
| `RABBITMQ_URL` | RabbitMQ connection URL | `amqp://guest:guest@localhost:5672` |

## RabbitMQ

- **Exchange**: `email.exchange` (topic)
- **Queue**: `email.send.queue`
- **Routing key**: `email.send.#`

### Message schema

```json
{
  "event": "email.send",
  "source": "user-service",
  "data": {
    "to": "user@example.com",
    "subject": "Welcome to Trade-X",
    "body": "<h1>Hello!</h1>"
  }
}
```

## Chạy local

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8003
```
