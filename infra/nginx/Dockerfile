FROM nginx:alpine

# Remove default nginx.conf and conf.d
RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy custom config as main nginx.conf
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Health check
#
# 127.0.0.1 chứ không phải localhost: busybox wget resolve localhost ra IPv6
# [::1] trước, mà `listen 80;` chỉ nghe IPv4 nên bị "Connection refused" và
# container bị đánh dấu unhealthy vĩnh viễn dù phục vụ request bình thường.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
