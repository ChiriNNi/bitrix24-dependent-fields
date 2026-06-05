const fs = require("node:fs");
const path = require("node:path");

module.exports = async function handler(request, response) {
  const postData = await readPostData(request);
  const placementOptions = parsePlacementOptions(postData.PLACEMENT_OPTIONS);
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const injected = html.replace(
    "</head>",
    `<script>window.BITRIX_PLACEMENT_OPTIONS = ${JSON.stringify(placementOptions)};</script></head>`
  );

  response.setHeader("Content-Type", "text/html; charset=utf-8");
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

function readPostData(request) {
  return new Promise((resolve) => {
    if (request.method !== "POST") {
      resolve({});
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(Object.fromEntries(new URLSearchParams(body)));
    });
  });
}
