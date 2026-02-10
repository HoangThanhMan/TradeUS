# Trade-X Symbol Subscription Service

Quản lý danh sách các mã tài sản (symbol) mà người dùng muốn theo dõi.

## Tính năng

- CRUD đăng ký / hủy đăng ký symbol cho user
- Đảm bảo unique: mỗi user chỉ đăng ký 1 symbol 1 lần (unique compound index)
- Truy vấn subscribers theo symbol (để Alert Service sử dụng)

## API

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/subscriptions/` | Đăng ký theo dõi symbol |
| DELETE | `/api/subscriptions/?user_id=...&symbol=...` | Hủy đăng ký |
| GET | `/api/subscriptions/user/{user_id}` | Danh sách symbol của user |
| GET | `/api/subscriptions/symbol/{symbol}/subscribers` | Danh sách user theo dõi symbol |
| GET | `/api/subscriptions/check?user_id=...&symbol=...` | Kiểm tra đã đăng ký chưa |

## Cấu hình

| Biến môi trường | Mô tả | Mặc định |
|---|---|---|
| `MONGODB_URL` | MongoDB URI | `mongodb://localhost:27017` |
| `MONGODB_DATABASE` | Tên database | `tradex_subscriptions` |
| `PORT` | Cổng dịch vụ | `8005` |

## Chạy local

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8005
```
