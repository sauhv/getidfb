FROM node:18-slim

# Bỏ download Chromium mặc định của Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Cài đặt gói hệ thống + Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Thư mục làm việc
WORKDIR /app

# Cài dependencies
COPY package*.json ./
RUN npm install --production

# Copy toàn bộ source
COPY . .

# Expose, Render sẽ override PORT = 10000
EXPOSE 10000

# Puppeteer dùng Chromium trong container
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Start app
CMD ["node", "index.js"]
