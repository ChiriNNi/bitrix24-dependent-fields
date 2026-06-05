const fs = require("node:fs");
const path = require("node:path");

module.exports = function handler(request, response) {
  const html = fs.readFileSync(path.join(process.cwd(), "install.html"), "utf8");

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("X-Frame-Options", "ALLOWALL");
  response.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.bitrix24.kz https://*.bitrix24.com https://*.bitrix24.ru"
  );
  response.status(200).send(html);
};
