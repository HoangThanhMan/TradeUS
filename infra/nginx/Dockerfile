FROM nginx:alpine

# Remove default nginx.conf and conf.d
RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy custom config as main nginx.conf
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
