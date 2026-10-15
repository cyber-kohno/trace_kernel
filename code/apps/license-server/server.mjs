import "dotenv/config";
import http from "http";
import { issueLicenseKey } from "./issue-license.mjs";

// curl -X POST http://localhost:3000/issue -H "Content-Type: application/json" -d "{\"product\":\"analyzer-pro\",\"features\":[\"core\",\"advanced\"]}"

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/issue") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        console.log("RAW BODY:", body); // ← 追加
        const data = JSON.parse(body);

        const payload = {
          v: 1,
          p: data.product,
          f: data.features,
          i: Math.floor(Date.now() / 1000),
        };

        const licenseKey = await issueLicenseKey(payload);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ licenseKey }));
      } catch (e) {
        res.writeHead(400);
        res.end("invalid request");
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3000, () => {
  console.log("License server running at http://localhost:3000");
});
