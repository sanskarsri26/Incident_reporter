/**
 * Trivial placeholder server for docker-compose structural validity.
 * See simulator/services/gateway/server.ts for context on why this
 * exists and what it deliberately does not do.
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8080);
const SERVICE_NAME = "checkout-service";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: SERVICE_NAME }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});
