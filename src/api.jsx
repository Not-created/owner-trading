/*
|--------------------------------------------------------------------------
| OWNER TRADING — CENTRAL API GATEWAY
|--------------------------------------------------------------------------
|
| Single frontend gateway for backend communication.
|
| Pages and components must NOT create their own fetch/HTTP infrastructure.
| They should use the functions exported from this file.
|
| Responsibilities:
|
|   • Base API URL resolution
|   • HTTP requests
|   • JSON request/response handling
|   • Authentication credentials
|   • Timeout / abort handling
|   • Error normalization
|   • GET / POST / PUT / PATCH / DELETE
|   • Common resource helpers
|
| The actual backend endpoint paths remain centralized below.
|
|--------------------------------------------------------------------------
*/


/* ==========================================================================
   1. API CONFIGURATION
   ========================================================================== */

const DEFAULT_API_BASE_URL = "/api";

const REQUEST_TIMEOUT_MS = 30_000;


/*
 * Vite-style environment variable support.
 *
 * The application can be deployed behind the same domain:
 *
 *   /api
 *
 * or configured with:
 *
 *   VITE_API_BASE_URL=https://example.com/api
 *
 * No secret credentials belong in frontend environment variables.
 */

function resolveApiBaseUrl() {
  const configured =
    typeof import.meta !== "undefined" &&
    import.meta.env
      ? import.meta.env.VITE_API_BASE_URL
      : undefined;

  const value =
    typeof configured === "string" && configured.trim()
      ? configured.trim()
      : DEFAULT_API_BASE_URL;

  return value.replace(/\/+$/, "");
}

const API_BASE_URL = resolveApiBaseUrl();


/* ==========================================================================
   2. API ERROR
   ========================================================================== */

export class ApiError extends Error {

  constructor(message, options = {}) {

    super(message);

    this.name = "ApiError";

    this.status =
      Number.isFinite(options.status)
        ? options.status
        : null;

    this.code =
      options.code ??
      null;

    this.details =
      options.details ??
      null;

    this.data =
      options.data ??
      null;

    this.url =
      options.url ??
      null;
  }
}


/* ==========================================================================
   3. REQUEST URL
   ========================================================================== */

function buildUrl(path) {

  if (!path) {
    throw new ApiError("API path is required.");
  }

  /*
   * Allow absolute URLs when explicitly supplied.
   */
  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  const normalizedPath =
    String(path).startsWith("/")
      ? String(path)
      : `/${String(path)}`;

  return `${API_BASE_URL}${normalizedPath}`;
}


/* ==========================================================================
   4. RESPONSE PARSING
   ========================================================================== */

async function parseResponse(response) {

  const contentType =
    response.headers.get("content-type") || "";

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {

    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();

  return text || null;
}


/* ==========================================================================
   5. ERROR NORMALIZATION
   ========================================================================== */

function getErrorMessage(data, status) {

  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data?.detail) {

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => (
          item?.msg ||
          item?.message ||
          String(item)
        ))
        .join(", ");
    }

    if (typeof data.detail === "string") {
      return data.detail;
    }
  }

  if (data?.message) {
    return String(data.message);
  }

  if (data?.error) {

    if (typeof data.error === "string") {
      return data.error;
    }

    if (data.error?.message) {
      return String(data.error.message);
    }
  }

  if (status === 401) {
    return "Authentication required.";
  }

  if (status === 403) {
    return "You do not have permission to perform this action.";
  }

  if (status === 404) {
    return "Requested resource was not found.";
  }

  if (status >= 500) {
    return "Server error. Please try again.";
  }

  return "Request failed.";
}


/* ==========================================================================
   6. REQUEST CORE
   ========================================================================== */

export async function apiRequest(
  path,
  options = {}
) {

  const {
    method = "GET",
    body,
    headers = {},
    signal,
    timeout = REQUEST_TIMEOUT_MS,
    credentials = "include",
  } = options;

  const url = buildUrl(path);

  const controller = new AbortController();

  let timeoutId = null;

  /*
   * If the caller supplied an AbortSignal, propagate its cancellation.
   */
  const abortFromCaller = () => {
    controller.abort();
  };

  if (signal) {

    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        abortFromCaller,
        { once: true }
      );
    }
  }

  timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeout);


  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };


  /*
   * Only attach JSON content type when a request body exists and the
   * caller has not explicitly selected another content type.
   */
  let requestBody = body;

  if (
    body !== undefined &&
    body !== null &&
    !(body instanceof FormData) &&
    !(body instanceof Blob)
  ) {

    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] =
        "application/json";
    }

    if (
      typeof body === "object" &&
      requestHeaders["Content-Type"].includes(
        "application/json"
      )
    ) {
      requestBody = JSON.stringify(body);
    }
  }


  try {

    const response = await fetch(
      url,
      {
        method,
        headers: requestHeaders,
        body: requestBody,
        credentials,
        signal: controller.signal,
        cache: "no-store",
      }
    );

    const data = await parseResponse(response);

    if (!response.ok) {

      throw new ApiError(
        getErrorMessage(
          data,
          response.status
        ),
        {
          status: response.status,
          code:
            data?.code ??
            data?.error_code ??
            null,
          details:
            data?.details ??
            null,
          data,
          url,
        }
      );
    }

    return data;

  } catch (error) {

    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.name === "AbortError") {

      throw new ApiError(
        "Request timed out or was cancelled.",
        {
          code: "REQUEST_ABORTED",
          url,
        }
      );
    }

    throw new ApiError(
      error?.message ||
        "Unable to connect to the backend.",
      {
        code: "NETWORK_ERROR",
        url,
        details: error,
      }
    );

  } finally {

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    if (signal) {
      signal.removeEventListener(
        "abort",
        abortFromCaller
      );
    }
  }
}


/* ==========================================================================
   7. HTTP HELPERS
   ========================================================================== */

export function apiGet(path, options = {}) {

  return apiRequest(
    path,
    {
      ...options,
      method: "GET",
    }
  );
}


export function apiPost(
  path,
  body,
  options = {}
) {

  return apiRequest(
    path,
    {
      ...options,
      method: "POST",
      body,
    }
  );
}


export function apiPut(
  path,
  body,
  options = {}
) {

  return apiRequest(
    path,
    {
      ...options,
      method: "PUT",
      body,
    }
  );
}


export function apiPatch(
  path,
  body,
  options = {}
) {

  return apiRequest(
    path,
    {
      ...options,
      method: "PATCH",
      body,
    }
  );
}


export function apiDelete(
  path,
  options = {}
) {

  return apiRequest(
    path,
    {
      ...options,
      method: "DELETE",
    }
  );
}


/* ==========================================================================
   8. AUTH API
   ========================================================================== */

export const authApi = Object.freeze({

  me() {
    return apiGet("/auth/me");
  },

  login(credentials) {
    return apiPost(
      "/auth/login",
      credentials
    );
  },

  logout() {
    return apiPost("/auth/logout");
  },

});


/* ==========================================================================
   9. BROKER API
   ========================================================================== */

export const brokerApi = Object.freeze({

  plugins() {
    return apiGet("/brokers/plugins");
  },

  accounts() {
    return apiGet("/brokers/accounts");
  },

  createAccount(data) {
    return apiPost(
      "/brokers/accounts",
      data
    );
  },

  updateAccount(accountId, data) {
    return apiPut(
      `/brokers/accounts/${encodeURIComponent(accountId)}`,
      data
    );
  },

  deleteAccount(accountId) {
    return apiDelete(
      `/brokers/accounts/${encodeURIComponent(accountId)}`
    );
  },

  connect(accountId) {
    return apiPost(
      `/brokers/accounts/${encodeURIComponent(accountId)}/connect`
    );
  },

  disconnect(accountId) {
    return apiPost(
      `/brokers/accounts/${encodeURIComponent(accountId)}/disconnect`
    );
  },

  test(accountId) {
    return apiPost(
      `/brokers/accounts/${encodeURIComponent(accountId)}/test`
    );
  },

  info(accountId) {
    return apiGet(
      `/brokers/accounts/${encodeURIComponent(accountId)}/info`
    );
  },

  orders(accountId, params = "") {
    return apiGet(
      `/brokers/orders${params ? `?${params}` : ""}`,
      {
        headers: accountId
          ? {
              "X-Broker-Account": String(accountId),
            }
          : {},
      }
    );
  },

  positions(accountId) {
    return apiGet(
      "/brokers/positions",
      {
        headers: accountId
          ? {
              "X-Broker-Account": String(accountId),
            }
          : {},
      }
    );
  },

  holdings(accountId) {
    return apiGet(
      "/brokers/holdings",
      {
        headers: accountId
          ? {
              "X-Broker-Account": String(accountId),
            }
          : {},
      }
    );
  },

  funds(accountId) {
    return apiGet(
      "/brokers/funds",
      {
        headers: accountId
          ? {
              "X-Broker-Account": String(accountId),
            }
          : {},
      }
    );
  },

  tradeHistory(accountId) {
    return apiGet(
      "/brokers/trade-history",
      {
        headers: accountId
          ? {
              "X-Broker-Account": String(accountId),
            }
          : {},
      }
    );
  },

  quotes(accountId, symbols = []) {

    const query = new URLSearchParams();

    if (accountId) {
      query.set(
        "account_id",
        String(accountId)
      );
    }

    if (Array.isArray(symbols)) {

      symbols
        .filter(Boolean)
        .forEach((symbol) => {
          query.append(
            "symbol",
            String(symbol)
          );
        });

    }

    const queryString = query.toString();

    return apiGet(
      `/brokers/quotes${
        queryString
          ? `?${queryString}`
          : ""
      }`
    );
  },

});


/* ==========================================================================
   10. ORDER API
   ========================================================================== */

export const orderApi = Object.freeze({

  list(params = {}) {

    const query = new URLSearchParams();

    Object.entries(params).forEach(
      ([key, value]) => {

        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          query.set(
            key,
            String(value)
          );
        }

      }
    );

    const queryString = query.toString();

    return apiGet(
      `/orders${
        queryString
          ? `?${queryString}`
          : ""
      }`
    );
  },

  create(data) {
    return apiPost(
      "/orders",
      data
    );
  },

  modify(orderId, data) {
    return apiPut(
      `/orders/${encodeURIComponent(orderId)}`,
      data
    );
  },

  cancel(orderId) {
    return apiDelete(
      `/orders/${encodeURIComponent(orderId)}`
    );
  },

  status(orderId) {
    return apiGet(
      `/orders/${encodeURIComponent(orderId)}`
    );
  },

});


/* ==========================================================================
   11. STRATEGY API
   ========================================================================== */

export const strategyApi = Object.freeze({

  list() {
    return apiGet("/strategies");
  },

  get(strategyId) {
    return apiGet(
      `/strategies/${encodeURIComponent(strategyId)}`
    );
  },

  create(data) {
    return apiPost(
      "/strategies",
      data
    );
  },

  update(strategyId, data) {
    return apiPut(
      `/strategies/${encodeURIComponent(strategyId)}`,
      data
    );
  },

  delete(strategyId) {
    return apiDelete(
      `/strategies/${encodeURIComponent(strategyId)}`
    );
  },

  activate(strategyId) {
    return apiPost(
      `/strategies/${encodeURIComponent(strategyId)}/activate`
    );
  },

  deactivate(strategyId) {
    return apiPost(
      `/strategies/${encodeURIComponent(strategyId)}/deactivate`
    );
  },

  backtest(strategyId, data = {}) {
    return apiPost(
      `/strategies/${encodeURIComponent(strategyId)}/backtest`,
      data
    );
  },

});


/* ==========================================================================
   12. BACKTEST API
   ========================================================================== */

export const backtestApi = Object.freeze({

  run(data) {
    return apiPost(
      "/backtest",
      data
    );
  },

  results(backtestId) {
    return apiGet(
      `/backtest/${encodeURIComponent(backtestId)}`
    );
  },

  history() {
    return apiGet("/backtest");
  },

});


/* ==========================================================================
   13. RISK API
   ========================================================================== */

export const riskApi = Object.freeze({

  get() {
    return apiGet("/risk");
  },

  update(data) {
    return apiPut(
      "/risk",
      data
    );
  },

  status() {
    return apiGet("/risk/status");
  },

});


/* ==========================================================================
   14. OWNER CONTROL API
   ========================================================================== */

export const ownerControlApi = Object.freeze({

  status() {
    return apiGet("/owner-control");
  },

  update(data) {
    return apiPut(
      "/owner-control",
      data
    );
  },

  killSwitch(enabled, reason = "") {
    return apiPost(
      "/owner-control/kill-switch",
      {
        enabled,
        reason,
      }
    );
  },

  cancelAllOrders() {
    return apiPost(
      "/owner-control/cancel-all-orders"
    );
  },

  squareOffAll() {
    return apiPost(
      "/owner-control/square-off-all"
    );
  },

});


/* ==========================================================================
   15. SYSTEM API
   ========================================================================== */

export const systemApi = Object.freeze({

  health() {
    return apiGet("/health");
  },

  status() {
    return apiGet("/system/status");
  },

  logs(params = {}) {

    const query = new URLSearchParams();

    Object.entries(params).forEach(
      ([key, value]) => {

        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          query.set(
            key,
            String(value)
          );
        }

      }
    );

    const queryString = query.toString();

    return apiGet(
      `/logs${
        queryString
          ? `?${queryString}`
          : ""
      }`
    );
  },

});


/* ==========================================================================
   16. AI API
   ========================================================================== */

export const aiApi = Object.freeze({

  providers() {
    return apiGet("/ai/providers");
  },

  provider(providerId) {
    return apiGet(
      `/ai/providers/${encodeURIComponent(providerId)}`
    );
  },

  configure(providerId, data) {
    return apiPut(
      `/ai/providers/${encodeURIComponent(providerId)}`,
      data
    );
  },

  test(providerId) {
    return apiPost(
      `/ai/providers/${encodeURIComponent(providerId)}/test`
    );
  },

});


/* ==========================================================================
   17. PLUGIN API
   ========================================================================== */

export const pluginApi = Object.freeze({

  list() {
    return apiGet("/plugins");
  },

  get(pluginId) {
    return apiGet(
      `/plugins/${encodeURIComponent(pluginId)}`
    );
  },

  enable(pluginId) {
    return apiPost(
      `/plugins/${encodeURIComponent(pluginId)}/enable`
    );
  },

  disable(pluginId) {
    return apiPost(
      `/plugins/${encodeURIComponent(pluginId)}/disable`
    );
  },

});


/* ==========================================================================
   18. SETTINGS API
   ========================================================================== */

export const settingsApi = Object.freeze({

  get() {
    return apiGet("/settings");
  },

  update(data) {
    return apiPut(
      "/settings",
      data
    );
  },

});


/* ==========================================================================
   19. PROFILE API
   ========================================================================== */

export const profileApi = Object.freeze({

  get() {
    return apiGet("/profile");
  },

  update(data) {
    return apiPut(
      "/profile",
      data
    );
  },

});


/* ==========================================================================
   20. THEME STORAGE
   ========================================================================== */

export const THEME_STORAGE_KEY =
  "owner-trading-theme";


export function getStoredTheme() {

  try {

    const stored =
      window.localStorage.getItem(
        THEME_STORAGE_KEY
      );

    if (
      stored === "dark" ||
      stored === "light"
    ) {
      return stored;
    }

  } catch {
    /* Ignore unavailable storage. */
  }

  return null;
}


export function setStoredTheme(theme) {

  if (
    theme !== "dark" &&
    theme !== "light"
  ) {
    return;
  }

  try {

    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      theme
    );

  } catch {
    /* Ignore unavailable storage. */
  }
}


/* ==========================================================================
   21. API INFORMATION
   ========================================================================== */

export function getApiBaseUrl() {
  return API_BASE_URL;
}


/* ==========================================================================
   END OF OWNER TRADING CENTRAL API GATEWAY
   ==========================================================================
   */
