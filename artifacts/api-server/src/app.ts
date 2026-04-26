import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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

// Apply a raised limit only to authenticated upload endpoints that receive
// base64-encoded file content in a JSON body.  15 MB of base64 decodes to
// roughly 11 MB of raw bytes, which is enforced again inside each handler.
// All other routes are served by the 1 MB global limit below.
const BASE64_UPLOAD_PATHS =
  /^\/api\/clinics\/[^/]+\/(?:docs-constitutivos\/[^/]+\/(?:upload|files)|evidencias\/upload|documentos\/[^/]+\/upload)/;
app.use(BASE64_UPLOAD_PATHS, express.json({ limit: "15mb" }));
app.use(BASE64_UPLOAD_PATHS, express.urlencoded({ extended: true, limit: "15mb" }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

export default app;
