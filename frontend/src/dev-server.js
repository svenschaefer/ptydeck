import http from "node:http";
import { loadClientConfig } from "./config.js";

const config = loadClientConfig();

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ptydeck frontend bootstrap</title>
  </head>
  <body>
    <main>
      <h1>ptydeck frontend bootstrap</h1>
      <p>API base URL: ${config.apiBaseUrl}</p>
      <p>WebSocket URL: ${config.wsUrl}</p>
    </main>
  </body>
</html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(config.port, () => {
  console.log(`frontend dev server listening on :${config.port}`);
});
