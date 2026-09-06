/* =========================================================
   OWNER TRADING — COMMON UTILITIES
   ========================================================= */

/* =========================================================
   GENERAL
   ========================================================= */

export function isNil(value) {
  return value === null || value === undefined;
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isEmpty(value) {
  if (isNil(value)) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(Math.max(number, min), max);
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeParseJSON(value, fallback = null) {
  if (typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/* =========================================================
   CURRENCY / NUMBER FORMATTING
   ========================================================= */

export function formatNumber(
  value,
  decimals = 2,
  locale = "en-IN"
) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatInteger(value, locale = "en-IN") {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString(locale, {
    maximumFractionDigits: 0,
  });
}

export function formatCurrency(
  value,
  currency = "INR",
  decimals = 2
) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
}

export function formatRupees(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return `₹${formatNumber(number, decimals)}`;
}

export function formatSignedNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  const sign = number > 0 ? "+" : "";

  return `${sign}${formatNumber(number, decimals)}`;
}

export function formatSignedCurrency(
  value,
  currency = "INR",
  decimals = 2
) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  const absolute = Math.abs(number);
  const formatted = formatCurrency(absolute, currency, decimals);

  if (number > 0) return `+${formatted}`;
  if (number < 0) return `-${formatted}`;

  return formatted;
}

export function formatPercent(
  value,
  decimals = 2,
  signed = false
) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  const sign = signed && number > 0 ? "+" : "";

  return `${sign}${number.toFixed(decimals)}%`;
}

export function formatSignedPercent(value, decimals = 2) {
  return formatPercent(value, decimals, true);
}

/* =========================================================
   TRADING VALUES
   ========================================================= */

export function getPnlClass(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number === 0) {
    return "neutral";
  }

  return number > 0 ? "profit" : "loss";
}

export function getPnlDirection(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number === 0) {
    return "neutral";
  }

  return number > 0 ? "up" : "down";
}

export function calculatePnl({
  entryPrice,
  currentPrice,
  quantity,
  side = "BUY",
}) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);
  const qty = Number(quantity);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(current) ||
    !Number.isFinite(qty)
  ) {
    return null;
  }

  const normalizedSide = normalizeOrderSide(side);

  if (normalizedSide === "SELL") {
    return (entry - current) * qty;
  }

  return (current - entry) * qty;
}

export function calculatePnlPercent({
  entryPrice,
  currentPrice,
  side = "BUY",
}) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(current) ||
    entry === 0
  ) {
    return null;
  }

  const normalizedSide = normalizeOrderSide(side);

  if (normalizedSide === "SELL") {
    return ((entry - current) / entry) * 100;
  }

  return ((current - entry) / entry) * 100;
}

export function calculatePositionValue(price, quantity) {
  const numericPrice = Number(price);
  const numericQuantity = Number(quantity);

  if (
    !Number.isFinite(numericPrice) ||
    !Number.isFinite(numericQuantity)
  ) {
    return null;
  }

  return numericPrice * numericQuantity;
}

/* =========================================================
   ORDER HELPERS
   ========================================================= */

export function normalizeOrderSide(side) {
  const value = String(side || "").trim().toUpperCase();

  if (["BUY", "B", "LONG"].includes(value)) return "BUY";
  if (["SELL", "S", "SHORT"].includes(value)) return "SELL";

  return value || "UNKNOWN";
}

export function normalizeOrderType(type) {
  const value = String(type || "").trim().toUpperCase();

  const aliases = {
    MARKET: "MARKET",
    MKT: "MARKET",

    LIMIT: "LIMIT",
    LMT: "LIMIT",

    SL: "SL",
    "STOP LOSS": "SL",
    STOPLOSS: "SL",

    SL_M: "SL-M",
    "SL-M": "SL-M",
    STOPMARKET: "SL-M",
    "STOP MARKET": "SL-M",

    BRACKET: "BRACKET",
  };

  return aliases[value] || value || "UNKNOWN";
}

export function normalizeOrderStatus(status) {
  const value = String(status || "").trim().toUpperCase();

  const aliases = {
    COMPLETE: "COMPLETED",
    COMPLETED: "COMPLETED",
    EXECUTED: "COMPLETED",
    FILLED: "COMPLETED",

    OPEN: "OPEN",
    PENDING: "PENDING",
    TRIGGER_PENDING: "TRIGGER_PENDING",

    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",

    REJECTED: "REJECTED",
    FAILED: "FAILED",

    PARTIAL: "PARTIALLY_FILLED",
    PARTIALLY_FILLED: "PARTIALLY_FILLED",

    AMO: "AMO",
  };

  return aliases[value] || value || "UNKNOWN";
}

export function isBuyOrder(order) {
  return normalizeOrderSide(
    order?.side ??
      order?.transaction_type ??
      order?.transactionType
  ) === "BUY";
}

export function isSellOrder(order) {
  return normalizeOrderSide(
    order?.side ??
      order?.transaction_type ??
      order?.transactionType
  ) === "SELL";
}

export function isCompletedOrder(status) {
  return normalizeOrderStatus(status) === "COMPLETED";
}

export function isPendingOrder(status) {
  return [
    "PENDING",
    "OPEN",
    "TRIGGER_PENDING",
    "PARTIALLY_FILLED",
  ].includes(normalizeOrderStatus(status));
}

export function isTerminalOrder(status) {
  return [
    "COMPLETED",
    "CANCELLED",
    "REJECTED",
    "FAILED",
  ].includes(normalizeOrderStatus(status));
}

export function canCancelOrder(status) {
  return isPendingOrder(status);
}

/* =========================================================
   SYMBOL / EXCHANGE HELPERS
   ========================================================= */

export function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

export function normalizeExchange(exchange) {
  return String(exchange || "")
    .trim()
    .toUpperCase();
}

export function getSymbolFromInstrument(instrument) {
  if (!instrument) return "";

  return normalizeSymbol(
    instrument.symbol ??
      instrument.trading_symbol ??
      instrument.tradingSymbol ??
      instrument.instrument_name ??
      instrument.name ??
      instrument.scrip
  );
}

export function getExchangeFromInstrument(instrument) {
  if (!instrument) return "";

  return normalizeExchange(
    instrument.exchange ??
      instrument.exchange_segment ??
      instrument.exchangeSegment
  );
}

export function getOrderId(order) {
  if (!order) return null;

  return (
    order.order_id ??
    order.orderId ??
    order.nOrdNo ??
    order.nOrdNo ??
    order.id ??
    null
  );
}

/* =========================================================
   BROKER STATUS
   ========================================================= */

export function normalizeBrokerStatus(status) {
  const value = String(status || "").trim().toLowerCase();

  if (
    ["connected", "online", "authenticated", "active", "healthy"].includes(
      value
    )
  ) {
    return "connected";
  }

  if (
    ["connecting", "reconnecting", "pending", "authenticating"].includes(
      value
    )
  ) {
    return "connecting";
  }

  if (
    ["disconnected", "offline", "inactive", "logged_out"].includes(value)
  ) {
    return "disconnected";
  }

  if (["error", "failed", "unhealthy"].includes(value)) {
    return "error";
  }

  return "unknown";
}

export function isBrokerConnected(account) {
  if (!account) return false;

  return (
    account.connected === true ||
    normalizeBrokerStatus(
      account.status ??
        account.connection_status ??
        account.connectionStatus
    ) === "connected"
  );
}

/* =========================================================
   DATE / TIME
   ========================================================= */

export function toDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value,
  options = {}
) {
  const date = toDate(value);

  if (!date) return "—";

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...options,
    }
  );
}

export function formatTime(
  value,
  options = {}
) {
  const date = toDate(value);

  if (!date) return "—";

  return date.toLocaleTimeString(
    "en-IN",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      ...options,
    }
  );
}

export function formatDateTime(value) {
  const date = toDate(value);

  if (!date) return "—";

  return `${formatDate(date)} ${formatTime(date)}`;
}

export function formatISODate(value) {
  const date = toDate(value);

  if (!date) return "";

  return date.toISOString().slice(0, 10);
}

export function formatRelativeTime(value) {
  const date = toDate(value);

  if (!date) return "—";

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(Math.abs(diff) / 1000);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);

  if (days < 7) return `${days}d ago`;

  return formatDate(date);
}

/* =========================================================
   VALIDATION
   ========================================================= */

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );
}

export function isValidPhone(value) {
  return /^[0-9+\-\s()]{7,20}$/.test(
    String(value || "").trim()
  );
}

export function isRequired(value) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

export function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

export function isNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

export function validateRequiredFields(
  values,
  fields
) {
  const errors = {};

  fields.forEach((field) => {
    const key =
      typeof field === "string" ? field : field.name;

    const label =
      typeof field === "string"
        ? field
        : field.label || field.name;

    if (!isRequired(values?.[key])) {
      errors[key] = `${label} is required.`;
    }
  });

  return errors;
}

/* =========================================================
   DEBOUNCE / THROTTLE
   ========================================================= */

export function debounce(fn, delay = 300) {
  let timer = null;

  const debounced = (...args) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

export function throttle(fn, interval = 300) {
  let lastCall = 0;
  let timeout = null;

  const throttled = (...args) => {
    const now = Date.now();
    const remaining = interval - (now - lastCall);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      lastCall = now;
      fn(...args);
      return;
    }

    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        lastCall = Date.now();
        fn(...args);
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return throttled;
}

/* =========================================================
   ARRAY / OBJECT HELPERS
   ========================================================= */

export function uniqueBy(array, key) {
  if (!Array.isArray(array)) return [];

  const seen = new Set();

  return array.filter((item) => {
    const value =
      typeof key === "function"
        ? key(item)
        : item?.[key];

    if (seen.has(value)) return false;

    seen.add(value);
    return true;
  });
}

export function sortBy(
  array,
  accessor,
  direction = "asc"
) {
  if (!Array.isArray(array)) return [];

  const factor = direction === "desc" ? -1 : 1;

  return [...array].sort((a, b) => {
    const aValue =
      typeof accessor === "function"
        ? accessor(a)
        : a?.[accessor];

    const bValue =
      typeof accessor === "function"
        ? accessor(b)
        : b?.[accessor];

    if (aValue === bValue) return 0;

    if (aValue === null || aValue === undefined) {
      return 1;
    }

    if (bValue === null || bValue === undefined) {
      return -1;
    }

    return aValue > bValue ? factor : -factor;
  });
}

export function groupBy(array, accessor) {
  if (!Array.isArray(array)) return {};

  return array.reduce((groups, item) => {
    const key =
      typeof accessor === "function"
        ? accessor(item)
        : item?.[accessor];

    const groupKey = String(key ?? "undefined");

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    groups[groupKey].push(item);

    return groups;
  }, {});
}

export function pick(object, keys = []) {
  if (!isObject(object)) return {};

  return keys.reduce((result, key) => {
    if (key in object) {
      result[key] = object[key];
    }

    return result;
  }, {});
}

export function omit(object, keys = []) {
  if (!isObject(object)) return {};

  const excluded = new Set(keys);

  return Object.keys(object).reduce((result, key) => {
    if (!excluded.has(key)) {
      result[key] = object[key];
    }

    return result;
  }, {});
}

/* =========================================================
   API DATA NORMALIZATION
   ========================================================= */

export function getApiData(response, fallback = null) {
  if (isNil(response)) return fallback;

  if (
    isObject(response) &&
    Object.prototype.hasOwnProperty.call(response, "data")
  ) {
    return response.data;
  }

  return response;
}

export function getApiArray(response) {
  const data = getApiData(response, []);

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data?.positions)) return data.positions;
  if (Array.isArray(data?.accounts)) return data.accounts;

  return [];
}

/* =========================================================
   ERROR HELPERS
   ========================================================= */

export function getErrorMessage(error, fallback = "Something went wrong.") {
  if (!error) return fallback;

  if (typeof error === "string") return error;

  return (
    error.message ??
    error.detail ??
    error.error ??
    error.reason ??
    fallback
  );
}

/* =========================================================
   STORAGE
   ========================================================= */

export function storageGet(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);

    return value === null
      ? fallback
      : safeParseJSON(value, value);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    window.localStorage.setItem(
      key,
      typeof value === "string"
        ? value
        : JSON.stringify(value)
    );

    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   URL / QUERY HELPERS
   ========================================================= */

export function buildQueryString(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)));
      return;
    }

    search.set(key, String(value));
  });

  const result = search.toString();

  return result ? `?${result}` : "";
}

export function buildUrl(path, params = {}) {
  const query = buildQueryString(params);

  return `${path}${query}`;
}

/* =========================================================
   DOWNLOAD / CLIPBOARD
   ========================================================= */

export async function copyToClipboard(value) {
  if (!navigator?.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(String(value ?? ""));
    return true;
  } catch {
    return false;
  }
}

export function downloadTextFile(
  content,
  filename = "owner-trading.txt",
  type = "text/plain"
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

/* =========================================================
   COLOR / CHART HELPERS
   ========================================================= */

export function getChartDomain(values = []) {
  const numbers = values
    .map(Number)
    .filter(Number.isFinite);

  if (!numbers.length) {
    return {
      min: 0,
      max: 1,
    };
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  if (min === max) {
    return {
      min: min - 1,
      max: max + 1,
    };
  }

  const padding = (max - min) * 0.05;

  return {
    min: min - padding,
    max: max + padding,
  };
}

export function normalizeSeries(data = []) {
  if (!Array.isArray(data)) return [];

  return data
    .map((item, index) => {
      if (typeof item === "number") {
        return {
          index,
          value: item,
        };
      }

      return {
        ...item,
        index,
        value: Number(item?.value),
      };
    })
    .filter((item) => Number.isFinite(item.value));
}

/* =========================================================
   LOCAL TIME / MARKET SESSION
   ========================================================= */

export function getMinutesFromTime(value) {
  if (!value) return null;

  const match = String(value).match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export function isWithinTimeRange(
  current,
  start,
  end
) {
  const currentMinutes = getMinutesFromTime(current);
  const startMinutes = getMinutesFromTime(start);
  const endMinutes = getMinutesFromTime(end);

  if (
    currentMinutes === null ||
    startMinutes === null ||
    endMinutes === null
  ) {
    return false;
  }

  if (startMinutes <= endMinutes) {
    return (
      currentMinutes >= startMinutes &&
      currentMinutes <= endMinutes
    );
  }

  return (
    currentMinutes >= startMinutes ||
    currentMinutes <= endMinutes
  );
}

/* =========================================================
   EXPORT DEFAULT
   ========================================================= */

export default {
  isNil,
  isObject,
  isEmpty,
  clamp,
  safeNumber,
  safeParseJSON,
  sleep,

  formatNumber,
  formatInteger,
  formatCurrency,
  formatRupees,
  formatSignedNumber,
  formatSignedCurrency,
  formatPercent,
  formatSignedPercent,

  getPnlClass,
  getPnlDirection,
  calculatePnl,
  calculatePnlPercent,
  calculatePositionValue,

  normalizeOrderSide,
  normalizeOrderType,
  normalizeOrderStatus,
  isBuyOrder,
  isSellOrder,
  isCompletedOrder,
  isPendingOrder,
  isTerminalOrder,
  canCancelOrder,

  normalizeSymbol,
  normalizeExchange,
  getSymbolFromInstrument,
  getExchangeFromInstrument,
  getOrderId,

  normalizeBrokerStatus,
  isBrokerConnected,

  toDate,
  formatDate,
  formatTime,
  formatDateTime,
  formatISODate,
  formatRelativeTime,

  isValidEmail,
  isValidPhone,
  isRequired,
  isPositiveNumber,
  isNonNegativeNumber,
  validateRequiredFields,

  debounce,
  throttle,

  uniqueBy,
  sortBy,
  groupBy,
  pick,
  omit,

  getApiData,
  getApiArray,
  getErrorMessage,

  storageGet,
  storageSet,
  storageRemove,

  buildQueryString,
  buildUrl,

  copyToClipboard,
  downloadTextFile,

  getChartDomain,
  normalizeSeries,

  getMinutesFromTime,
  isWithinTimeRange,
};
