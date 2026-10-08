import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { askForHelp, cleanQuestion, helpWithStep, HelperError, MODEL } from "./lib/helper.js";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HelperError("That message is too long.", 413);
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new HelperError("Bad request.", 400);
  }
}

async function serveStatic(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = normalize(join(PUBLIC_DIR, path === "/" ? "index.html" : path));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

async function handleApi(req, res, path) {
  const body = await readJson(req);

  if (path === "/api/ask") {
    const question = cleanQuestion(body.question);
    if (!question) throw new HelperError("Please type or say your question first.", 400);
    return sendJson(res, 200, await askForHelp(question));
  }

  if (path === "/api/stuck") {
    const question = cleanQuestion(body.question);
    const steps = Array.isArray(body.steps) ? body.steps.slice(0, 30) : [];
    const stepIndex = Number.isInteger(body.stepIndex) ? body.stepIndex : -1;
    if (!question || stepIndex < 0 || stepIndex >= steps.length) {
      throw new HelperError("Bad request.", 400);
    }
    const problem = cleanQuestion(body.problem);
    return sendJson(res, 200, await helpWithStep({ question, steps, stepIndex, problem }));
  }

  throw new HelperError("Not found", 404);
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    if (path.startsWith("/api/")) {
      if (req.method !== "POST") throw new HelperError("Use POST.", 405);
      return await handleApi(req, res, path);
    }
    return await serveStatic(req, res);
  } catch (err) {
    if (err instanceof HelperError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    return sendJson(res, 500, { error: "Something went wrong on our side. Please try again in a moment." });
  }
});

server.listen(PORT, () => {
  console.log(`Ask Your Kid is running at http://localhost:${PORT} (model: ${MODEL})`);
});
