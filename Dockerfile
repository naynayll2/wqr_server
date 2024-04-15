FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/wqrhttps
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
RUN ls
EXPOSE 3000
RUN chown -R node /usr/wqrhttps
USER node
# CMD ["node", "build/index.js"]
