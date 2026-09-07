FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# torch trước, từ index CPU-only.
#
# Wheel torch mặc định trên PyPI là bản CUDA: ~2.5 GB kể cả đống nvidia-*. Server
# deploy (yêu cầu ở mục B1 của docs/deployment.md) không có GPU nên toàn bộ phần
# đó tải về rồi nằm không. Bản CPU chỉ ~200 MB, build nhanh hơn nhiều và ít đứt
# giữa chừng hơn — lần build đầu ở đây đã timeout sau 49 phút vì tải bản CUDA.
#
# Không cần sửa code: model_manager.py:256 đã chọn
# torch.device("cuda" if torch.cuda.is_available() else "cpu").
RUN pip install --no-cache-dir --timeout 120 --retries 10 \
    --index-url https://download.pytorch.org/whl/cpu \
    "torch>=2.1.0"

# Phần còn lại từ PyPI. torch đã thoả nên pip bỏ qua, không tải lại.
RUN pip install --no-cache-dir --timeout 120 --retries 10 -r requirements.txt

# Copy application code
COPY . .

# Create models directory
RUN mkdir -p models

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8002/health')" || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
