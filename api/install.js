const fs = require("node:fs");
const path = require("node:path");

module.exports = function handler(request, response) {
  const html = fs.readFileSync(path.join(process.cwd(), "install.html"), "utf8");

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.status(200).send(html);
};
