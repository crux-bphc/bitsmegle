FROM node:20

WORKDIR /app

COPY server/package*.json ./
COPY server/tsconfig.json ./

RUN npm install

COPY server .

RUN npm run build

CMD ["npm", "start"]
