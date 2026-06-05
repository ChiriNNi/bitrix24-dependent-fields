const fs = require("node:fs");
const path = require("node:path");

module.exports = async function handler(request, response) {
  const requestData = await readRequestData(request);
  const placementOptions = parsePlacementOptions(requestData.PLACEMENT_OPTIONS);
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const injected = html.replace(
    "</head>",
    `<script>window.BITRIX_PLACEMENT_OPTIONS = ${JSON.stringify(placementOptions)};</script></head>`
  );

  setFrameHeaders(response);
  response.status(200).send(injected);
};

function parsePlacementOptions(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function readRequestData(request) {
  return new Promise((resolve) => {
    const fromQuery = request.query || {};
    const fromBody = request.body && typeof request.body === "object" ? request.body : {};

    if (request.method !== "POST") {
      resolve(fromQuery);
      return;
    }

    if (Object.keys(fromBody).length) {
      resolve({ ...fromQuery, ...fromBody });
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve({ ...fromQuery, ...Object.fromEntries(new URLSearchParams(body)) });
    });
  });
}

function setFrameHeaders(response) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("X-Frame-Options", "ALLOWALL");
  response.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.bitrix24.kz https://*.bitrix24.com https://*.bitrix24.ru"
  );
}
