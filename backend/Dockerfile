FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm install --production
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
