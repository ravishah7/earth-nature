import { HttpError } from "./response.js";

const REGION_ID = /^[A-Za-z0-9._-]{2,40}$/;
const LEVELS = new Set(["country", "admin1", "all"]);

export function parseRegionId(value) {
  if (typeof value !== "string" || !REGION_ID.test(value)) {
    throw new HttpError(400, "INVALID_REGION_ID", "Invalid region id.");
  }
  return value;
}

export function parseCoordinate(value, name, min, max) {
  const n = Number(value);
  if (value === undefined || value === "" || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(
      400,
      "INVALID_COORDINATE",
      `${name} must be a number between ${min} and ${max}.`
    );
  }
  return n;
}

export function parseLevel(value, fallback = "all") {
  if (value === undefined || value === "") return fallback;
  if (!LEVELS.has(value)) {
    throw new HttpError(400, "INVALID_LEVEL", `level must be one of: ${[...LEVELS].join(", ")}.`);
  }
  return value;
}

export function parseLimit(value, fallback = 10, max = 50) {
  if (value === undefined || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, "INVALID_LIMIT", "limit must be a positive integer.");
  }
  return Math.min(n, max);
}

export function parseQuery(value, maxLength = 80) {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLength).trim();
}
