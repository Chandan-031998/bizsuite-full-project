FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src ./src
RUN mkdir -p uploads

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "start"]
