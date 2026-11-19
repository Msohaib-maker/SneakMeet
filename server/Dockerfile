FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY signaling.js ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "signaling.js"]
