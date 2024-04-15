FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/wqr
COPY . .
RUN npm install && npm install -g typescript
RUN npm i --dev @types/express @types/node
RUN ls && tsc
EXPOSE 3000
RUN chown -R node /usr/wqr
USER node
RUN npm run build
