import { resolve, sep } from "node:path";

export function resolvePublicFilePath(rootDir, requestPath) {
  const normalizedRequestPath = typeof requestPath === "string" ? requestPath : "/";

  const pathOnly = normalizedRequestPath.split("?")[0].split("#")[0];
  let decodedPath = pathOnly;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    return null;
  }

  if (decodedPath === "/") {
    return resolve(rootDir, "index.html");
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = resolve(rootDir, relativePath);
  const rootWithSep = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;

  if (candidate !== rootDir && !candidate.startsWith(rootWithSep)) {
    return null;
  }

  return candidate;
}
