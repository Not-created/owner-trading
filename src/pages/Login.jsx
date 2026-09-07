import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Icon,
  Input,
  PasswordInput,
  ThemeToggle,
} from "../components/UI.jsx";
import { useAuth, useTheme } from "../context.jsx";
import { isRequired } from "../utils.js";

/* =========================================================
   OWNER TRADING — LOGIN
   ========================================================= */

export default function Login() {
  const {
    login,
    authLoading,
    authError,
    clearAuthError,
  } = useAuth();

  const {
    theme,
    setTheme,
  } = useTheme();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    clearAuthError?.();
  }, [clearAuthError]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setValidationError("");
    clearAuthError?.();

    if (!isRequired(username)) {
      setValidationError("Username or email is required.");
      return;
    }

    if (!isRequired(password)) {
      setValidationError("Password is required.");
      return;
    }

    try {
      await login({
        username: username.trim(),
        password,
      });
    } catch {
      /*
       * Authentication errors are already handled by context.
       * No fake success is shown here.
       */
    }
  };

  const errorMessage = validationError || authError;

  return (
    <main className="ot-login-page">
      <div className="ot-login-background" aria-hidden="true">
        <div className="ot-login-grid" />
        <div className="ot-login-glow ot-login-glow-one" />
        <div className="ot-login-glow ot-login-glow-two" />
      </div>

      <header className="ot-login-topbar">
        <div className="ot-brand">
          <div className="ot-brand-mark">
            <Icon name="trendingUp" size={20} />
          </div>

          <div className="ot-brand-copy">
            <strong>Owner Trading</strong>
            <span>Trading Control Platform</span>
          </div>
        </div>

        <ThemeToggle
          theme={theme}
          onChange={setTheme}
        />
      </header>

      <div className="ot-login-content">
        <section className="ot-login-intro">
          <div className="ot-login-status">
            <span className="ot-status-dot ot-status-success ot-status-pulse" />
            <span>Secure trading environment</span>
          </div>

          <h1>
            Trade with
            <br />
            <span>complete control.</span>
          </h1>

          <p>
            Access your Owner Trading control center to manage
            brokers, strategies, orders, risk and system operations.
          </p>

          <div className="ot-login-features">
            <div>
              <span className="ot-login-feature-icon">
                <Icon name="shieldCheck" size={18} />
              </span>

              <div>
                <strong>Secure access</strong>
                <span>Protected owner authentication</span>
              </div>
            </div>

            <div>
              <span className="ot-login-feature-icon">
                <Icon name="zap" size={18} />
              </span>

              <div>
                <strong>Real-time control</strong>
                <span>Monitor your connected trading system</span>
              </div>
            </div>

            <div>
              <span className="ot-login-feature-icon">
                <Icon name="shield" size={18} />
              </span>

              <div>
                <strong>Risk-first operations</strong>
                <span>Centralized trading and risk controls</span>
              </div>
            </div>
          </div>
        </section>

        <Card className="ot-login-card" padding="lg">
          <div className="ot-login-card-header">
            <div className="ot-login-lock">
              <Icon name="lock" size={22} />
            </div>

            <div>
              <h2>Welcome back</h2>
              <p>Sign in to continue to Owner Trading.</p>
            </div>
          </div>

          {errorMessage ? (
            <Alert
              variant="danger"
              title="Sign-in failed"
              dismissible
              onDismiss={() => {
                setValidationError("");
                clearAuthError?.();
              }}
            >
              {errorMessage}
            </Alert>
          ) : null}

          <form
            className="ot-login-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <Input
              label="Username or Email"
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setValidationError("");
                clearAuthError?.();
              }}
              placeholder="Enter your username or email"
              autoComplete="username"
              autoFocus
              disabled={authLoading}
              required
              icon="user"
            />

            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setValidationError("");
                clearAuthError?.();
              }}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={authLoading}
              required
            />

            <div className="ot-login-options">
              <span className="ot-login-secure-note">
                <Icon name="lock" size={13} />
                Secure authenticated session
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={authLoading}
              icon="lock"
            >
              {authLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="ot-login-help">
            <button
              type="button"
              onClick={() => setShowHelp((value) => !value)}
            >
              <Icon name="info" size={14} />
              Need help signing in?
            </button>

            {showHelp ? (
              <div className="ot-login-help-box">
                <strong>Authentication required</strong>
                <p>
                  Use the Owner Trading account credentials configured
                  for your backend authentication service. Broker
                  credentials are not entered on this screen.
                </p>
              </div>
            ) : null}
          </div>

          <div className="ot-login-footer">
            <span>Owner Trading</span>
            <span>•</span>
            <span>Protected Control Center</span>
          </div>
        </Card>
      </div>

      <footer className="ot-login-bottom">
        <span>Owner Trading Platform</span>
        <span>Authentication • Risk • Execution • Monitoring</span>
      </footer>
    </main>
  );
}
