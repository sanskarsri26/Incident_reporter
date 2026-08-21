/**
 * Trivial placeholder server for docker-compose structural validity.
 *
 * The actual "gateway" service in this project is a data-generation
 * concept (see simulator/fault-injection and simulator/traffic), not a
 * live running microservice — logs and metrics are generated offline by
 * the simulator, not by real request traffic. This server exists only so
 * `docker compose up` has something real to build and run for the
 * `gateway` node in the topology, and answers a basic health check.
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8080);
const SERVICE_NAME = "gateway";

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
