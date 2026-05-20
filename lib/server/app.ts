import { Hono } from "hono";
import { sessionsRoute } from "./routes/sessions";

export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.route("/sessions", sessionsRoute);

export type AppType = typeof app;
