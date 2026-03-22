import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadClientConfig } from "./config.js";

const config = loadClientConfig();
const root = fileURLToPath(new URL("./public", import.meta.url));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function toFilePath(urlPath) {
  if (urlPath === "/") {
    return join(root, "index.html");
  }
  return join(root, urlPath.replace(/^\//, ""));
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = toFilePath(req.url || "/");
    const body = await readFile(filePath);
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

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
