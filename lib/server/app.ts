import { Hono } from "hono";
import { conceptsRoute } from "./routes/concepts";
import { sessionsRoute } from "./routes/sessions";

export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.route("/sessions", sessionsRoute);
app.route("/concepts", conceptsRoute);

export type AppType = typeof app;
