// Shared fetch wrapper. Every endpoint returns { data, meta, error }; this
// unwraps it and turns failures into ApiError with a readable message.

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiGet(path, { params, signal } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }

  let res;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the EarthExplorer server. Is it running?", { code: "NETWORK" });
  }

  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }

  if (!res.ok || body?.error) {
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, {
      status: res.status,
      code: body?.error?.code,
    });
  }
  return { data: body.data, meta: body.meta };
}
