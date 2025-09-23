FROM node:18-slim

# Bỏ download Chromium mặc định của Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Cài đặt các gói hệ thống cần thiết cho Puppeteer & Chrome
RUN apt-get update && apt-get install -y \
  gnupg wget ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxrandr2 xdg-utils --no-install-recommends

# Thêm kho lưu trữ Google Chrome stable và cài Chrome stable
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && apt-get install -y google-chrome-stable && rm -rf /var/lib/apt/lists/*

# Thư mục làm việc trong container
WORKDIR /app

# Copy package và cài dependencies
COPY package*.json ./
RUN npm install

# Copy toàn bộ source code
COPY . .

# Expose port ứng dụng
EXPOSE 3000

# Thiết lập biến môi trường cho Puppeteer dùng Chrome stable
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Khởi chạy ứng dụng
CMD ["node", "index.js"]
