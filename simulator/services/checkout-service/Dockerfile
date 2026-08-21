FROM node:22-alpine
WORKDIR /app
RUN npm install -g tsx@4
COPY server.ts ./
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["tsx", "server.ts"]
