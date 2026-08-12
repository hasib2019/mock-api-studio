import path from "node:path";

/**
 * Where the registered definitions live. Override with MOCK_DATA_DIR to point
 * the studio at a shared folder (a network drive, a mounted volume, ...).
 */
export const DATA_DIR = process.env.MOCK_DATA_DIR
  ? path.resolve(process.env.MOCK_DATA_DIR)
  : path.join(process.cwd(), "data");

export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ENDPOINTS_DIR = path.join(DATA_DIR, "endpoints");
export const LOGS_DIR = path.join(DATA_DIR, "logs");
export const USERS_FILE = path.join(DATA_DIR, "users.json");

/** Max request logs kept on disk (oldest pruned first). */
export const LOG_RETENTION = Number(process.env.MOCK_LOG_RETENTION ?? 500);
