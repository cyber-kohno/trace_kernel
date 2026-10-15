import { loadDesktopMcpIdentity } from "./desktop-mcp.mjs";
console.log(
  "Desktop/MCP release metadata verified:",
  JSON.stringify(loadDesktopMcpIdentity()),
);
