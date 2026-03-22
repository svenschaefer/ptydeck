import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadClientConfig } from "./config.js";
import { resolvePublicFilePath } from "./static-path.js";

const config = loadClientConfig();
const root = fileURLToPath(new URL("./public", import.meta.url));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function injectRuntimeConfig(html) {
  const runtimeConfig = {
    apiBaseUrl: config.apiBaseUrl,
    wsUrl: config.wsUrl,
    debugLogs: config.debugLogs
  };
  const script = `<script>window.__PTYDECK_CONFIG__=${JSON.stringify(runtimeConfig)};</script>`;
  return html.replace("</head>", `  ${script}\n  </head>`);
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = resolvePublicFilePath(root, req.url || "/");
    if (!filePath) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    let body = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

    if (contentType.startsWith("text/html")) {
      body = Buffer.from(injectRuntimeConfig(body.toString("utf8")), "utf8");
    }

    res.writeHead(200, { "content-type": contentType });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(config.port, () => {
  console.log(`frontend dev server listening on :${config.port}`);
});
