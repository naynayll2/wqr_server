FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/wqr
RUN npm install && npm install -g typescript
RUN npm i --dev @types/express @types/node
EXPOSE 3000
COPY . .
RUN tsc
RUN chown -R node /usr/wqr
USER node
RUN npm run build
