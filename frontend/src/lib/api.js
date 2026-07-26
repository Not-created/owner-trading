import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function formatApiError(err) {
  const d = err?.response?.data?.error?.detail ?? err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join("; ");
  if (d && typeof d === "object" && typeof d.msg === "string") return d.msg;
  return err?.message || "Request failed";
}
