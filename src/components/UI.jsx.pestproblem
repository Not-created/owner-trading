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
    <Input
      {...props}
      type={visible ? "text" : "password"}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      icon="lock"
      iconRight={
        <button
          type="button"
          className="ot-input-action"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={17} />
        </button>
      }
    />
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  ...props
}) {
  return (
    <Input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      icon="search"
      className={className}
      {...props}
    />
  );
}

export function Select({
  label,
  hint,
  error,
  required,
  options = [],
  placeholder = "Select...",
  value,
  onChange,
  className = "",
  ...props
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx("ot-select-wrap", error && "ot-input-error")}>
        <select value={value ?? ""} onChange={onChange} className="ot-select" {...props}>
          {placeholder ? <option value="">{placeholder}</option> : null}

          {options.map((option) => {
            const item =
              typeof option === "string"
                ? { value: option, label: option }
                : option;

            return (
              <option
                key={String(item.value)}
                value={item.value}
                disabled={item.disabled}
              >
                {item.label}
              </option>
            );
          })}
        </select>

        <Icon name="chevronDown" size={15} className="ot-select-arrow" />
      </div>
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  error,
  required,
  className = "",
  ...props
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <textarea className={cx("ot-textarea", error && "ot-input-error")} {...props} />
    </Field>
  );
}

export function NumberInput(props) {
  return <Input type="number" inputMode="decimal" {...props} />;
}

/* =========================================================
   TOGGLE / SWITCH
   ========================================================= */

export function Toggle({
  checked = false,
  onChange,
  disabled = false,
  label,
  description,
  size = "md",
  className = "",
  id,
}) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cx(
        "ot-toggle-row",
        disabled && "ot-toggle-disabled",
        className
      )}
    >
      <span className={cx("ot-switch", `ot-switch-${size}`)}>
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.checked, event)}
        />
        <span className="ot-switch-track">
          <span className="ot-switch-thumb" />
        </span>
      </span>

      {label || description ? (
        <span className="ot-toggle-copy">
          {label ? <strong>{label}</strong> : null}
          {description ? <small>{description}</small> : null}
        </span>
      ) : null}
    </label>
  );
}

export const Switch = Toggle;

/* =========================================================
   TABS
   ========================================================= */

export function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  className = "",
  variant = "default",
}) {
  const firstValue = tabs[0]?.value ?? tabs[0]?.key;
  const [internal, setInternal] = useState(defaultValue ?? firstValue);
  const activeValue = value !== undefined ? value : internal;

  const select = (tab) => {
    const next = tab.value ?? tab.key;

    if (value === undefined) {
      setInternal(next);
    }

    onChange?.(next, tab);
  };

  return (
    <div className={cx("ot-tabs", `ot-tabs-${variant}`, className)}>
      <div className="ot-tab-list" role="tablist">
        {tabs.map((tab) => {
          const tabValue = tab.value ?? tab.key;
          const active = tabValue === activeValue;

          return (
            <button
              key={String(tabValue)}
              type="button"
              role="tab"
              aria-selected={active}
              className={cx("ot-tab", active && "ot-tab-active")}
              onClick={() => select(tab)}
              disabled={tab.disabled}
            >
              {tab.icon
                ? typeof tab.icon === "string"
                  ? <Icon name={tab.icon} size={15} />
                  : tab.icon
                : null}
              <span>{tab.label ?? tab.name}</span>
              {tab.count !== undefined ? (
                <span className="ot-tab-count">{tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   TABLE
   ========================================================= */

export function Table({
  columns = [],
  data = [],
  rowKey = "id",
  loading = false,
  emptyMessage = "No data available.",
  onRowClick,
  compact = false,
  stickyHeader = false,
  className = "",
  ...props
}) {
  const getKey = (row, index) =>
    typeof rowKey === "function"
      ? rowKey(row, index)
      : row?.[rowKey] ?? index;

  return (
    <div
      className={cx(
        "ot-table-wrap",
        compact && "ot-table-compact",
        stickyHeader && "ot-table-sticky",
        className
      )}
      {...props}
    >
      <table className="ot-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key || column.accessor || column.label}
                style={column.width ? { width: column.width } : undefined}
                className={column.headerClassName}
              >
                {column.header ?? column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <TableLoadingRow colSpan={columns.length} />
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  compact
                  title={emptyMessage}
                  icon="database"
                />
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={String(getKey(row, index))}
                className={onRowClick ? "ot-table-row-clickable" : ""}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              >
                {columns.map((column) => {
                  const accessor = column.accessor ?? column.key;
                  const rawValue =
                    typeof accessor === "function"
                      ? accessor(row, index)
                      : row?.[accessor];

                  const content = column.render
                    ? column.render(rawValue, row, index)
                    : rawValue ?? "—";

                  return (
                    <td
                      key={column.key || column.accessor || column.label}
                      className={column.cellClassName}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TableLoadingRow({ colSpan = 1 }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="ot-table-loading">
          <Spinner />
          <span>Loading data...</span>
        </div>
      </td>
    </tr>
  );
}

/* =========================================================
   MODAL / CONFIRM
   ========================================================= */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  closeOnEscape = true,
  className = "",
}) {
  useEffect(() => {
    if (!open || !closeOnEscape) return undefined;

    const handler = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ot-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className={cx("ot-modal", `ot-modal-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "ot-modal-title" : undefined}
        onMouseDown={stopEvent}
      >
        {(title || subtitle || onClose) && (
          <div className="ot-modal-header">
            <div>
              {title ? <h3 id="ot-modal-title">{title}</h3> : null}
              {subtitle ? <p>{subtitle}</p> : null}
            </div>

            {onClose ? (
              <button
                type="button"
                className="ot-icon-btn"
                onClick={onClose}
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            ) : null}
          </div>
        )}

        <div className="ot-modal-body">{children}</div>

        {footer ? <div className="ot-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm action",
  message = "Are you sure you want to continue?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <div className="ot-modal-actions">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>

          <Button
            variant={variant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="ot-confirm">
        <div className={cx("ot-confirm-icon", `ot-confirm-${variant}`)}>
          <Icon
            name={variant === "danger" ? "warning" : "info"}
            size={23}
          />
        </div>

        <p>{message}</p>
      </div>
    </Modal>
  );
}

/* =========================================================
   DROPDOWN
   ========================================================= */

export function Dropdown({
  trigger,
  children,
  align = "right",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handler = (event) => {
      if (!ref.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={cx("ot-dropdown", className)}>
      <button
        type="button"
        className="ot-dropdown-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>

      {open ? (
        <div className={cx("ot-dropdown-menu", `ot-dropdown-${align}`)}>
          {typeof children === "function"
            ? children(() => setOpen(false))
            : children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  icon,
  danger = false,
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={cx("ot-dropdown-item", danger && "ot-dropdown-item-danger")}
      disabled={disabled}
      onClick={onClick}
    >
      {icon
        ? typeof icon === "string"
          ? <Icon name={icon} size={16} />
          : icon
        : null}
      <span>{children}</span>
    </button>
  );
}

/* =========================================================
   LOADING / SKELETON / EMPTY / ERROR
   ========================================================= */

export function Spinner({ size = "md", className = "" }) {
  return (
    <span
      className={cx("ot-spinner", `ot-spinner-${size}`, className)}
      aria-label="Loading"
      role="status"
    />
  );
}

export function Loading({
  label = "Loading...",
  full = false,
  className = "",
}) {
  return (
    <div className={cx("ot-loading", full && "ot-loading-full", className)}>
      <Spinner />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = 18,
  radius = "md",
  className = "",
}) {
  return (
    <span
      className={cx("ot-skeleton", `ot-radius-${radius}`, className)}
      style={{
        width,
        height,
      }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon = "database",
  action,
  compact = false,
  className = "",
}) {
  return (
    <div className={cx("ot-empty", compact && "ot-empty-compact", className)}>
      <div className="ot-empty-icon">
        {typeof icon === "string" ? <Icon name={icon} size={24} /> : icon}
      </div>

      <h3>{title}</h3>

      {description ? <p>{description}</p> : null}

      {action ? <div className="ot-empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  error,
  retry,
  className = "",
}) {
  const text =
    message ||
    (error instanceof Error ? error.message : error) ||
    "The requested data could not be loaded.";

  return (
    <div className={cx("ot-error-state", className)}>
      <div className="ot-error-icon">
        <Icon name="error" size={24} />
      </div>

      <h3>{title}</h3>
      <p>{text}</p>

      {retry ? (
        <Button variant="secondary" icon="refresh" onClick={retry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/* =========================================================
   ALERT
   ========================================================= */

export function Alert({
  variant = "info",
  title,
  children,
  icon,
  dismissible = false,
  onDismiss,
  className = "",
}) {
  const defaultIcons = {
    info: "info",
    success: "success",
    warning: "warning",
    danger: "error",
  };

  return (
    <div
      className={cx("ot-alert", `ot-alert-${variant}`, className)}
      role={variant === "danger" ? "alert" : "status"}
    >
      <div className="ot-alert-icon">
        {typeof (icon || defaultIcons[variant]) === "string" ? (
          <Icon name={icon || defaultIcons[variant]} size={18} />
        ) : (
          icon
        )}
      </div>

      <div className="ot-alert-content">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>

      {dismissible ? (
        <button
          type="button"
          className="ot-alert-close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}

/* =========================================================
   AVATAR
   ========================================================= */

export function Avatar({
  name,
  src,
  size = "md",
  status,
  className = "",
}) {
  return (
    <span className={cx("ot-avatar", `ot-avatar-${size}`, className)}>
      {src ? (
        <img src={src} alt={name || "User"} />
      ) : (
        <span>{getInitials(name || "User")}</span>
      )}

      {status ? (
        <span className={cx("ot-avatar-status", `ot-avatar-status-${status}`)} />
      ) : null}
    </span>
  );
}

/* =========================================================
   TOOLTIP
   ========================================================= */

export function Tooltip({ children, content, position = "top" }) {
  return (
    <span className={cx("ot-tooltip", `ot-tooltip-${position}`)}>
      {children}
      {content ? <span className="ot-tooltip-content">{content}</span> : null}
    </span>
  );
}

/* =========================================================
   PROGRESS
   ========================================================= */

export function Progress({
  value = 0,
  max = 100,
  label,
  showValue = false,
  variant = "primary",
  size = "md",
  className = "",
}) {
  const safeMax = Number(max) || 100;
  const safeValue = Math.min(
    safeMax,
    Math.max(0, Number(value) || 0)
  );
  const percent = (safeValue / safeMax) * 100;

  return (
    <div className={cx("ot-progress-wrap", className)}>
      {label || showValue ? (
        <div className="ot-progress-label">
          {label ? <span>{label}</span> : <span />}
          {showValue ? <span>{Math.round(percent)}%</span> : null}
        </div>
      ) : null}

      <div
        className={cx(
          "ot-progress",
          `ot-progress-${size}`,
          `ot-progress-${variant}`
        )}
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin="0"
        aria-valuemax={safeMax}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/* =========================================================
   DIVIDERS / SPACING
   ========================================================= */

export function Divider({ className = "" }) {
  return <div className={cx("ot-divider", className)} />;
}

export function Stack({
  children,
  gap = "md",
  direction = "column",
  align,
  justify,
  className = "",
}) {
  return (
    <div
      className={cx(
        "ot-stack",
        `ot-stack-${direction}`,
        `ot-gap-${gap}`,
        align && `ot-align-${align}`,
        justify && `ot-justify-${justify}`,
        className
      )}
    >
      {children}
    </div>
  );
}

export function Row({
  children,
  gap = "md",
  align = "center",
  justify,
  wrap = true,
  className = "",
}) {
  return (
    <Stack
      direction="row"
      gap={gap}
      align={align}
      justify={justify}
      className={cx(wrap && "ot-row-wrap", className)}
    >
      {children}
    </Stack>
  );
}

/* =========================================================
   GRID
   ========================================================= */

export function Grid({
  children,
  columns = 2,
  gap = "md",
  className = "",
}) {
  return (
    <div
      className={cx(
        "ot-grid",
        `ot-grid-${columns}`,
        `ot-grid-gap-${gap}`,
        className
      )}
    >
      {children}
    </div>
  );
}

export function ResponsiveGrid({
  children,
  minWidth = 240,
  gap = 16,
  className = "",
}) {
  return (
    <div
      className={cx("ot-responsive-grid", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}

/* =========================================================
   TRADING-SPECIFIC UI
   ========================================================= */

export function BuySellBadge({ side }) {
  const normalized = String(side || "").toUpperCase();

  if (normalized === "BUY") {
    return <Badge variant="success" dot>BUY</Badge>;
  }

  if (normalized === "SELL") {
    return <Badge variant="danger" dot>SELL</Badge>;
  }

  return <Badge variant="neutral">{side || "—"}</Badge>;
}

export function OrderStatus({ status }) {
  return <StatusBadge status={status} />;
}

export function ConnectionStatus({
  connected,
  connecting = false,
  label,
}) {
  if (connecting) {
    return <StatusDot status="warning" pulse label={label || "Connecting"} />;
  }

  return (
    <StatusDot
      status={connected ? "success" : "danger"}
      pulse={connected}
      label={label || (connected ? "Connected" : "Disconnected")}
    />
  );
}

export function PnlValue({
  value,
  currency = "₹",
  showSign = true,
  className = "",
}) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return <span className={className}>—</span>;
  }

  const positive = numeric > 0;
  const negative = numeric < 0;

  const formatted = Math.abs(numeric).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sign = showSign
    ? positive
      ? "+"
      : negative
        ? "-"
        : ""
    : negative
      ? "-"
      : "";

  return (
    <span
      className={cx(
        "ot-pnl-value",
        positive && "ot-pnl-positive",
        negative && "ot-pnl-negative",
        className
      )}
    >
      {sign}
      {currency}
      {formatted}
    </span>
  );
}

export function PriceValue({
  value,
  decimals = 2,
  prefix = "₹",
  className = "",
}) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return <span className={className}>—</span>;
  }

  return (
    <span className={className}>
      {prefix}
      {numeric.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

export function QuantityValue({
  value,
  decimals = 0,
  className = "",
}) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return <span className={className}>—</span>;
  }

  return (
    <span className={className}>
      {numeric.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

/* =========================================================
   SYMBOL / MARKET
   ========================================================= */

export function SymbolBadge({
  symbol,
  exchange,
  name,
  className = "",
}) {
  return (
    <div className={cx("ot-symbol", className)}>
      <div className="ot-symbol-main">
        <strong>{symbol || "—"}</strong>
        {exchange ? <span>{exchange}</span> : null}
      </div>
      {name ? <small>{name}</small> : null}
    </div>
  );
}

export function MarketTicker({
  symbol,
  value,
  change,
  changePercent,
  exchange,
  className = "",
}) {
  const positive = Number(change) > 0;
  const negative = Number(change) < 0;

  return (
    <div className={cx("ot-market-ticker", className)}>
      <SymbolBadge symbol={symbol} exchange={exchange} />

      <div className="ot-market-ticker-price">
        <strong>{value ?? "—"}</strong>

        {(change !== undefined || changePercent !== undefined) && (
          <span
            className={cx(
              positive && "ot-text-profit",
              negative && "ot-text-loss"
            )}
          >
            {change !== undefined ? change : ""}
            {changePercent !== undefined
              ? ` (${changePercent}%)`
              : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   CHART CONTAINER
   ========================================================= */

export function ChartContainer({
  children,
  title,
  subtitle,
  actions,
  height = 320,
  loading = false,
  empty = false,
  emptyMessage = "No chart data available.",
  className = "",
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={actions}
      padding="none"
      className={cx("ot-chart-card", className)}
    >
      <div
        className="ot-chart-container"
        style={{ minHeight: height }}
      >
        {loading ? (
          <Loading label="Loading chart..." />
        ) : empty ? (
          <EmptyState
            compact
            icon="chartLine"
            title={emptyMessage}
          />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/* =========================================================
   SENSITIVE / EMERGENCY ACTION SURFACE
   ========================================================= */

export function EmergencyAction({
  title = "Emergency control",
  description,
  actionLabel,
  icon = "zap",
  onAction,
  disabled = false,
  loading = false,
  className = "",
}) {
  return (
    <div className={cx("ot-emergency", className)}>
      <div className="ot-emergency-icon">
        <Icon name={icon} size={22} />
      </div>

      <div className="ot-emergency-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>

      {onAction ? (
        <Button
          variant="danger"
          icon={icon}
          disabled={disabled}
          loading={loading}
          onClick={onAction}
        >
          {actionLabel || "Execute"}
        </Button>
      ) : null}
    </div>
  );
}

/* =========================================================
   DATA FRESHNESS
   ========================================================= */

export function DataFreshness({
  timestamp,
  label = "Updated",
  className = "",
}) {
  const text = useMemo(() => {
    if (!timestamp) return "Unavailable";

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "Unavailable";

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [timestamp]);

  return (
    <span className={cx("ot-freshness", className)}>
      <Icon name="clock" size={13} />
      {label} {text}
    </span>
  );
}

/* =========================================================
   PAGINATION
   ========================================================= */

export function Pagination({
  page = 1,
  totalPages = 1,
  onChange,
  className = "",
}) {
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);

  for (let index = start; index <= end; index += 1) {
    pages.push(index);
  }

  return (
    <div className={cx("ot-pagination", className)}>
      <Button
        variant="ghost"
        size="sm"
        icon="chevronLeft"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange?.(page - 1)}
      />

      {start > 1 ? (
        <>
          <Button
            variant={page === 1 ? "primary" : "ghost"}
            size="sm"
            onClick={() => onChange?.(1)}
          >
            1
          </Button>
          {start > 2 ? <span className="ot-pagination-more">…</span> : null}
        </>
      ) : null}

      {pages.map((item) => (
        <Button
          key={item}
          variant={item === page ? "primary" : "ghost"}
          size="sm"
          onClick={() => onChange?.(item)}
        >
          {item}
        </Button>
      ))}

      {end < totalPages ? (
        <>
          {end < totalPages - 1 ? (
            <span className="ot-pagination-more">…</span>
          ) : null}

          <Button
            variant={page === totalPages ? "primary" : "ghost"}
            size="sm"
            onClick={() => onChange?.(totalPages)}
          >
            {totalPages}
          </Button>
        </>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        icon="chevronRight"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onChange?.(page + 1)}
      />
    </div>
  );
}

/* =========================================================
   SIDEBAR NAV ITEM
   ========================================================= */

export function NavItem({
  icon,
  label,
  active = false,
  badge,
  collapsed = false,
  onClick,
  href,
  className = "",
}) {
  const content = (
    <>
      <span className="ot-nav-item-icon">
        {typeof icon === "string" ? <Icon name={icon} size={18} /> : icon}
      </span>

      {!collapsed ? <span className="ot-nav-item-label">{label}</span> : null}

      {!collapsed && badge !== undefined ? (
        <span className="ot-nav-item-badge">{badge}</span>
      ) : null}
    </>
  );

  const classes = cx(
    "ot-nav-item",
    active && "ot-nav-item-active",
    collapsed && "ot-nav-item-collapsed",
    className
  );

  if (href) {
    return (
      <a href={href} className={classes} onClick={onClick}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick}>
      {content}
    </button>
  );
}

/* =========================================================
   TOP BAR ICON BUTTON
   ========================================================= */

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  badge,
  ...props
}) {
  return (
    <button
      type="button"
      className={cx("ot-icon-btn", `ot-icon-btn-${size}`, `ot-icon-btn-${variant}`)}
      aria-label={label}
      title={label}
      {...props}
    >
      {typeof icon === "string" ? <Icon name={icon} size={18} /> : icon}

      {badge !== undefined ? (
        <span className="ot-icon-btn-badge">{badge}</span>
      ) : null}
    </button>
  );
}

/* =========================================================
   THEME TOGGLE
   ========================================================= */

export function ThemeToggle({
  theme = "dark",
  onChange,
  compact = false,
  className = "",
}) {
  const dark = theme === "dark";

  return (
    <button
      type="button"
      className={cx(
        "ot-theme-toggle",
        compact && "ot-theme-toggle-compact",
        className
      )}
      onClick={() => onChange?.(dark ? "light" : "dark")}
      aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
      title={`Switch to ${dark ? "light" : "dark"} theme`}
    >
      <span className="ot-theme-toggle-icon">
        <Icon name={dark ? "moon" : "sun"} size={17} />
      </span>

      {!compact ? (
        <span>{dark ? "Dark" : "Light"}</span>
      ) : null}
    </button>
  );
}

/* =========================================================
   FORM ACTIONS
   ========================================================= */

export function FormActions({
  children,
  align = "right",
  className = "",
}) {
  return (
    <div
      className={cx(
        "ot-form-actions",
        `ot-form-actions-${align}`,
        className
      )}
    >
      {children}
    </div>
  );
}

/* =========================================================
   LOG / TERMINAL LINE
   ========================================================= */

export function LogLine({
  timestamp,
  level = "info",
  message,
  source,
  className = "",
}) {
  return (
    <div className={cx("ot-log-line", className)}>
      {timestamp ? <time>{timestamp}</time> : null}

      <Badge variant={level === "error" ? "danger" : level}>
        {String(level).toUpperCase()}
      </Badge>

      {source ? <span className="ot-log-source">{source}</span> : null}

      <span className="ot-log-message">{message || "—"}</span>
    </div>
  );
}

/* =========================================================
   EXPORT GROUP
   ========================================================= */

export default {
  Icon,
  Button,
  Card,
  Panel,
  Section,
  PageHeader,
  MetricCard,
  Badge,
  StatusDot,
  StatusBadge,
  Field,
  Input,
  PasswordInput,
  SearchInput,
  Select,
  Textarea,
  NumberInput,
  Toggle,
  Switch,
  Tabs,
  Table,
  TableLoadingRow,
  Modal,
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  Spinner,
  Loading,
  Skeleton,
  EmptyState,
  ErrorState,
  Alert,
  Avatar,
  Tooltip,
  Progress,
  Divider,
  Stack,
  Row,
  Grid,
  ResponsiveGrid,
  BuySellBadge,
  OrderStatus,
  ConnectionStatus,
  PnlValue,
  PriceValue,
  QuantityValue,
  SymbolBadge,
  MarketTicker,
  ChartContainer,
  EmergencyAction,
  DataFreshness,
  Pagination,
  NavItem,
  IconButton,
  ThemeToggle,
  FormActions,
  LogLine,
};
