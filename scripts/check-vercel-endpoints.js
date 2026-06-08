const BASE_URL = process.argv[2] || "https://bitrix24-dependent-fields.vercel.app";

const endpoints = [
  "/",
  "/index.html",
  "/app",
  "/app.html",
  "/install",
  "/install.html",
  "/api/app",
  "/api/install",
];

const postBody = new URLSearchParams({
  DOMAIN: "tootopbrass.bitrix24.kz",
  PROTOCOL: "1",
  LANG: "ru",
  APP_SID: "test",
  PLACEMENT_OPTIONS: JSON.stringify({ ENTITY_VALUE_ID: 721747 }),
});

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function run() {
  const failures = [];

  for (const endpoint of endpoints) {
    const url = new URL(endpoint, BASE_URL);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: postBody,
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const ok = response.status === 200 && contentType.includes("text/html") && text.includes("<!doctype html>");

    console.log(`${ok ? "OK " : "BAD"} ${response.status} ${endpoint}`);

    if (!ok) {
      failures.push({ endpoint, status: response.status, contentType, text: text.slice(0, 160) });
    }
  }

  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  }
}
