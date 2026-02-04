import fs from "fs";
import path from "path";

const ERROR_LOG_PATH = path.join(
  process.cwd(),
  "src",
  "scripts",
  "mammals",
  "MediaMammals(v2.1)",
  "utils",
  "errorLogger.log",
);

export function writeErrorLog(params: {
  stage: "QID" | "ENRICH" | "RECOVERY";
  canonicalName: string;
  message: string;
  qid?: string | null;
  extra?: any;
}) {
  const entry = {
    ts: new Date().toISOString(),
    stage: params.stage,
    conaonicalName: params.canonicalName,
    qid: params.qid ?? null,
    message: params.message,
    extra: params.extra ?? null,
  };

  fs.appendFileSync(ERROR_LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
}
