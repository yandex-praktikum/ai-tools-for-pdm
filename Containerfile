FROM node:24-alpine

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.js database.js ./

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

USER node

EXPOSE 8080

CMD ["npm", "start"]
