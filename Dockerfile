FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./

RUN apt-get update && apt-get install -y \
    libgbm-dev \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "node", "app.js" ]