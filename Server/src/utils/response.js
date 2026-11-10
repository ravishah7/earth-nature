// One JSON envelope for every endpoint: { data, meta, error }.
// meta always carries the same keys so the frontend can rely on the shape.

export function buildMeta(extra = {}) {
  return {
    source: null,
    resolution: null,
    baseline: null,
    units: null,
    missing: [],
    ...extra,
  };
}

export function sendOk(res, data, metaExtra = {}) {
  res.json({ data, meta: buildMeta(metaExtra), error: null });
}

export function sendError(res, status, code, message, details) {
  res.status(status).json({
    data: null,
    meta: buildMeta(),
    error: { code, message, ...(details ? { details } : {}) },
  });
}

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
