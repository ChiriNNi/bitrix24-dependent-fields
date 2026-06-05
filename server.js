const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4176);
const ROOT = __dirname;
const WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/rest/")) {
      await proxyBitrix(url, request, response);
      return;
    }

    serveStatic(url, response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});

async function proxyBitrix(url, request, response) {
  if (!WEBHOOK_URL) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "BITRIX_WEBHOOK_URL is not set" }));
    return;
  }

  const method = url.pathname.replace(/^\/rest\//, "");
  const body = await readBody(request);
  const bitrixResponse = await fetch(`${WEBHOOK_URL.replace(/\/$/, "")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body || "{}",
  });
  const text = await bitrixResponse.text();

  response.writeHead(bitrixResponse.status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(text);
}

function serveStatic(url, response) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
