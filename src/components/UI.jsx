import React, { useEffect, useId, useMemo, useRef, useState } from "react";

/* =========================================================
   INTERNAL HELPERS
   ========================================================= */

function cx(...values) {
  return values
    .flat(Infinity)
    .filter(Boolean)
    .join(" ");
}

function stopEvent(event) {
  event?.stopPropagation?.();
}

function getInitials(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/* =========================================================
   ICONS
   React-only SVG icons.
   No external icon package is required.
   ========================================================= */

export function Icon({
  name = "circle",
  size = 18,
  strokeWidth = 1.8,
  className = "",
  title,
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    "aria-hidden": title ? undefined : true,
    role: title ? "img" : undefined,
  };

  const paths = {
    menu: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    minus: <path d="M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    arrowLeft: <path d="m15 18-6-6 6-6" />,
    arrowRight: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.9-4" />
        <path d="M4 4v5h5" />
        <path d="M4 13a8 8 0 0 0 14.9 4" />
        <path d="M20 20v-5h-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 1.6-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2H11v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.6-1.6.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5v-2.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.6-1.6.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.6 1.6-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.2h-.2a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    moon: (
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    unlock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 7-2.65" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.9" />
        <path d="M6.6 6.6C3.7 8.3 2 12 2 12s3.5 7 10 7c1 0 2-.2 2.9-.5" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 3-4 3 2 5-7" />
      </>
    ),
    chartLine: (
      <>
        <path d="M3 17h18" />
        <path d="m4 15 4-5 4 3 7-8" />
      </>
    ),
    trendingUp: (
      <>
        <path d="M3 17 9 11l4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),
    trendingDown: (
      <>
        <path d="m3 7 6 6 4-4 8 8" />
        <path d="M15 17h6v-6" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 7h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12v4" />
        <path d="M16 13h5" />
        <circle cx="16" cy="13" r=".7" fill="currentColor" />
      </>
    ),
    orders: (
      <>
        <path d="M7 3h10v18H7z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
        <path d="M9 15h4" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 16 9 5 9-5" />
      </>
    ),
    shield: (
      <path d="M12 3 20 6v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6l8-3Z" />
    ),
    shieldCheck: (
      <>
        <path d="M12 3 20 6v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6l8-3Z" />
        <path d="m8.5 12 2.3 2.3 4.7-5" />
      </>
    ),
    zap: (
      <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />
    ),
    power: (
      <>
        <path d="M12 2v10" />
        <path d="M6.2 5.2a8 8 0 1 0 11.6 0" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: (
      <>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 15V3" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 21h14" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6" />
        <path d="M10 14 20 4" />
        <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    error: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6" />
        <path d="m15 9-6 6" />
      </>
    ),
    success: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4" />
        <path d="M8 3v4" />
        <path d="M3 10h18" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    filter: (
      <>
        <path d="M4 5h16" />
        <path d="M7 12h10" />
        <path d="M10 19h4" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </>
    ),
    terminal: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 9 3 3-3 3" />
        <path d="M13 15h4" />
      </>
    ),
    code: (
      <>
        <path d="m8 9-4 3 4 3" />
        <path d="m16 9 4 3-4 3" />
        <path d="m14 5-4 14" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
      </>
    ),
    wifi: (
      <>
        <path d="M2 8.5a15 15 0 0 1 20 0" />
        <path d="M5 12a10.5 10.5 0 0 1 14 0" />
        <path d="M8.5 15.5a5.5 5.5 0 0 1 7 0" />
        <path d="M12 19h.01" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="3" width="18" height="7" rx="2" />
        <rect x="3" y="14" width="18" height="7" rx="2" />
        <path d="M7 6.5h.01" />
        <path d="M7 17.5h.01" />
      </>
    ),
    cpu: (
      <>
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M9 1v3" />
        <path d="M15 1v3" />
        <path d="M9 20v3" />
        <path d="M15 20v3" />
        <path d="M20 9h3" />
        <path d="M20 15h3" />
        <path d="M1 9h3" />
        <path d="M1 15h3" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
    menuDots: (
      <>
        <circle cx="12" cy="5" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="19" r="1" fill="currentColor" />
      </>
    ),
    circle: <circle cx="12" cy="12" r="8" />,
  };

  return (
    <svg {...common}>
      {title ? <title>{title}</title> : null}
      {paths[name] || paths.circle}
    </svg>
  );
}

/* =========================================================
   BUTTON
   ========================================================= */

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  type = "button",
  className = "",
  title,
  onClick,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={cx(
        "ot-btn",
        `ot-btn-${variant}`,
        `ot-btn-${size}`,
        fullWidth && "ot-btn-full",
        className
      )}
      disabled={isDisabled}
      title={title}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : icon ? (
        typeof icon === "string" ? <Icon name={icon} size={16} /> : icon
      ) : null}

      {children ? <span>{children}</span> : null}

      {!loading && iconRight
        ? typeof iconRight === "string"
          ? <Icon name={iconRight} size={16} />
          : iconRight
        : null}
    </button>
  );
}

/* =========================================================
   CARD / PANEL / SECTION
   ========================================================= */

export function Card({
  children,
  title,
  subtitle,
  actions,
  padding = "md",
  className = "",
  ...props
}) {
  return (
    <section
      className={cx("ot-card", `ot-card-padding-${padding}`, className)}
      {...props}
    >
      {title || subtitle || actions ? (
        <div className="ot-card-header">
          <div className="ot-card-heading">
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="ot-card-actions">{actions}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}

export function Panel(props) {
  return <Card {...props} />;
}

export function Section({
  children,
  title,
  subtitle,
  actions,
  className = "",
  ...props
}) {
  return (
    <section className={cx("ot-section", className)} {...props}>
      {(title || subtitle || actions) && (
        <div className="ot-section-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/* =========================================================
   PAGE HEADER
   ========================================================= */

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  children,
  className = "",
}) {
  return (
    <div className={cx("ot-page-header", className)}>
      <div className="ot-page-header-main">
        {eyebrow ? <div className="ot-eyebrow">{eyebrow}</div> : null}

        <div className="ot-page-title-row">
          {icon ? (
            <div className="ot-page-title-icon">
              {typeof icon === "string" ? <Icon name={icon} size={22} /> : icon}
            </div>
          ) : null}

          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>

        {children}
      </div>

      {actions ? <div className="ot-page-header-actions">{actions}</div> : null}
    </div>
  );
}

/* =========================================================
   METRIC CARD
   ========================================================= */

export function MetricCard({
  label,
  value,
  subvalue,
  trend,
  trendLabel,
  icon,
  variant = "default",
  loading = false,
  className = "",
  onClick,
}) {
  return (
    <div
      className={cx(
        "ot-metric-card",
        `ot-metric-${variant}`,
        onClick && "ot-metric-clickable",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") onClick(event);
            }
          : undefined
      }
    >
      <div className="ot-metric-top">
        <span className="ot-metric-label">{label}</span>
        {icon ? (
          <span className="ot-metric-icon">
            {typeof icon === "string" ? <Icon name={icon} size={18} /> : icon}
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton width="70%" height={28} />
      ) : (
        <div className="ot-metric-value">{value ?? "—"}</div>
      )}

      {trend !== undefined || subvalue || trendLabel ? (
        <div className="ot-metric-bottom">
          {trend !== undefined ? (
            <span
              className={cx(
                "ot-trend",
                Number(trend) > 0 && "ot-trend-up",
                Number(trend) < 0 && "ot-trend-down",
                Number(trend) === 0 && "ot-trend-neutral"
              )}
            >
              {Number(trend) > 0 ? "↑" : Number(trend) < 0 ? "↓" : "→"}{" "}
              {Math.abs(Number(trend)).toFixed(2)}%
            </span>
          ) : null}

          {trendLabel ? <span>{trendLabel}</span> : null}
          {subvalue ? <span>{subvalue}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================
   BADGE / STATUS
   ========================================================= */

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = false,
  icon,
  className = "",
}) {
  return (
    <span
      className={cx(
        "ot-badge",
        `ot-badge-${variant}`,
        `ot-badge-${size}`,
        className
      )}
    >
      {dot ? <span className="ot-badge-dot" /> : null}
      {icon
        ? typeof icon === "string"
          ? <Icon name={icon} size={13} />
          : icon
        : null}
      {children}
    </span>
  );
}

export function StatusDot({
  status = "neutral",
  label,
  pulse = false,
  size = "md",
  className = "",
}) {
  return (
    <span className={cx("ot-status", `ot-status-${size}`, className)}>
      <span
        className={cx(
          "ot-status-dot",
          `ot-status-${status}`,
          pulse && "ot-status-pulse"
        )}
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function StatusBadge({ status, label, className = "" }) {
  const normalized = String(status || "unknown").toLowerCase();

  const map = {
    connected: "success",
    online: "success",
    active: "success",
    running: "success",
    completed: "success",
    success: "success",
    healthy: "success",
    buy: "success",
    open: "success",

    pending: "warning",
    queued: "warning",
    connecting: "warning",
    warning: "warning",
    paused: "warning",

    disconnected: "danger",
    offline: "danger",
    error: "danger",
    failed: "danger",
    stopped: "danger",
    rejected: "danger",
    sell: "danger",

    processing: "info",
    info: "info",

    cancelled: "neutral",
    canceled: "neutral",
    inactive: "neutral",
    unknown: "neutral",
  };

  return (
    <Badge
      variant={map[normalized] || "neutral"}
      dot
      className={className}
    >
      {label || status || "Unknown"}
    </Badge>
  );
}

/* =========================================================
   FORM CONTROLS
   ========================================================= */

export function Field({
  label,
  required = false,
  hint,
  error,
  children,
  className = "",
}) {
  return (
    <div className={cx("ot-field", className)}>
      {label ? (
        <label className="ot-field-label">
          {label}
          {required ? <span className="ot-required">*</span> : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <div className="ot-field-error">
          <Icon name="error" size={13} />
          {error}
        </div>
      ) : hint ? (
        <div className="ot-field-hint">{hint}</div>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  required,
  icon,
  iconRight,
  className = "",
  inputClassName = "",
  ...props
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx("ot-input-wrap", error && "ot-input-error")}>
        {icon ? (
          <span className="ot-input-icon">
            {typeof icon === "string" ? <Icon name={icon} size={17} /> : icon}
          </span>
        ) : null}

        <input className={cx("ot-input", inputClassName)} {...props} />

        {iconRight ? (
          <span className="ot-input-icon ot-input-icon-right">
            {typeof iconRight === "string"
              ? <Icon name={iconRight} size={17} />
              : iconRight}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

export function PasswordInput({
  label = "Password",
  hint,
  error,
  required,
  className = "",
  ...props
}) {
  const [visible, setVisible] = useState(false);

  return (
