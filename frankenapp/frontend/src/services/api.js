/**
 * api.js — lightweight HTTP client wrapper around fetch.
 * Provides get/post/put/delete helpers that always parse JSON responses.
 */

const DEFAULT_HEADERS = { "Content-Type": "application/json" };

async function request(method, url, body) {
  const opts = {
    method,
    headers: DEFAULT_HEADERS,
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    let msg = resp.statusText;
    try {
      const err = await resp.json();
      msg = err.detail ?? err.error ?? msg;
    } catch (_) {}
    throw new Error(`API error ${resp.status}: ${msg}`);
  }
  // 204 No Content
  if (resp.status === 204) return null;
  return resp.json();
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body),
  put: (url, body) => request("PUT", url, body),
  delete: (url) => request("DELETE", url),
};
