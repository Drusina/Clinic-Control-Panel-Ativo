import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireSuperAdmin } from "./middleware/auth";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Apply tight body-size limits to the public Autentique webhook before the
// global parsers run.  The body stream can only be consumed once, so
// these small-limit parsers either parse the request (setting req.body) or
// reject it with 413 — preventing large attacker-controlled bodies from being
// buffered before authentication is checked in the route handler.
app.use("/api/autentique/webhook", express.json({ limit: "1mb" }));
app.use("/api/autentique/webhook", express.urlencoded({ extended: false, limit: "1mb" }));

// For authenticated upload endpoints that carry base64-encoded file content:
// authenticate FIRST (requireSuperAdmin reads only the Authorization header —
// no body is consumed), then allow the larger body to be parsed.  Requests
// without a valid super-admin token are rejected with 401/403 before any
// large payload is buffered, closing the pre-auth memory-exhaustion vector.
// Authenticated requests then parse up to 15 MB; each handler enforces a
// tighter 10 MB decoded-byte limit after base64 expansion.
const BASE64_UPLOAD_PATHS =
  /^\/api\/clinics\/[^/]+\/(?:docs-constitutivos\/[^/]+\/(?:upload|files)|evidencias\/upload|documentos\/[^/]+\/upload)/;
app.use(BASE64_UPLOAD_PATHS, requireSuperAdmin);
app.use(BASE64_UPLOAD_PATHS, express.json({ limit: "15mb" }));
app.use(BASE64_UPLOAD_PATHS, express.urlencoded({ extended: true, limit: "15mb" }));

// Global 1 MB parsers for all other routes.  Upload paths already have their
// body parsed above; express skips re-parsing when req.body is already set.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

export default app;
