import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  apiGet,
  apiPost,
  getStoredTheme,
  setStoredTheme,
} from "./api.jsx";

/*
|--------------------------------------------------------------------------
| OWNER TRADING — GLOBAL APPLICATION CONTEXT
|--------------------------------------------------------------------------
|
| Single global state layer for the complete frontend.
|
| Responsibilities:
|
|   Authentication
|   • Current user
|   • Session restore
|   • Login
|   • Logout
|   • Authentication loading state
|
| Theme
|   • Dark / Light
|   • Persistent preference
|   • System-wide theme
|
| Trading/Application state
|   • Broker status
|   • System status
|   • Emergency state
|   • Global loading state
|   • Global error state
|
| Architecture:
|
|   App.jsx
|      ↓
|   AppContext
|      ├── Authentication
|      ├── Theme
|      ├── Broker state
|      ├── System state
|      └── Global application state
|
| Pages/components consume this context instead of creating duplicate
| global state systems.
|
|--------------------------------------------------------------------------
*/


/* ==========================================================================
   1. CONTEXT
   ========================================================================== */

const AppContext = createContext(null);


/* ==========================================================================
   2. CONSTANTS
   ========================================================================== */

export const THEMES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

const DEFAULT_THEME = THEMES.DARK;

const AUTH_USER_STORAGE_KEY = "owner-trading-user";


/* ==========================================================================
   3. SAFE STORAGE HELPERS
   ========================================================================== */

function readStoredUser() {
  try {
    const value = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);

    if (!value) {
      return null;
    }

    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeStoredUser(user) {
  try {
    if (user) {
      window.localStorage.setItem(
        AUTH_USER_STORAGE_KEY,
        JSON.stringify(user)
      );
    } else {
      window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  } catch {
    /*
     * Storage can be unavailable in private browsing or restricted
     * environments. Authentication remains controlled by the backend.
     */
  }
}


/* ==========================================================================
   4. THEME APPLICATION
   ========================================================================== */

function normalizeTheme(theme) {
  return theme === THEMES.LIGHT
    ? THEMES.LIGHT
    : THEMES.DARK;
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);

  if (typeof document === "undefined") {
    return normalizedTheme;
  }

  const root = document.documentElement;

  root.setAttribute("data-theme", normalizedTheme);

  /*
   * Compatibility class.
   *
   * The application uses data-theme as the primary contract, while the
   * "dark" class remains available for reusable components that may depend
   * on Tailwind-style dark selectors.
   */
  root.classList.toggle(
    "dark",
    normalizedTheme === THEMES.DARK
  );

  root.style.colorScheme = normalizedTheme;

  return normalizedTheme;
}


/* ==========================================================================
   5. PROVIDER
   ========================================================================== */

export function AppProvider({ children }) {

  /* ---------------------------------------------------------------------- */
  /* Authentication                                                        */
  /* ---------------------------------------------------------------------- */

  const [user, setUser] = useState(() => readStoredUser());

  const [authLoading, setAuthLoading] = useState(true);

  const [authError, setAuthError] = useState(null);


  /* ---------------------------------------------------------------------- */
  /* Theme                                                                  */
  /* ---------------------------------------------------------------------- */

  const [theme, setThemeState] = useState(() => {
    const storedTheme = getStoredTheme();

    return normalizeTheme(
      storedTheme || DEFAULT_THEME
    );
  });


  /* ---------------------------------------------------------------------- */
  /* Broker / System Global State                                          */
  /* ---------------------------------------------------------------------- */

  const [brokerState, setBrokerState] = useState({
    accounts: [],
    plugins: [],
    connected: false,
    primaryAccount: null,
    loading: false,
    error: null,
  });

  const [systemState, setSystemState] = useState({
    status: null,
    healthy: null,
    loading: false,
    error: null,
  });

  const [emergencyState, setEmergencyState] = useState({
    enabled: false,
    active: false,
    reason: null,
  });

  const [globalLoading, setGlobalLoading] = useState(false);

  const [globalError, setGlobalError] = useState(null);


  /* ==========================================================================
     6. THEME INITIALIZATION
     ========================================================================== */

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);


  /* ==========================================================================
     7. THEME ACTIONS
     ========================================================================== */

  const setTheme = useCallback((nextTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme);

    setThemeState(normalizedTheme);
  }, []);


  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) => (
      currentTheme === THEMES.DARK
        ? THEMES.LIGHT
        : THEMES.DARK
    ));
  }, []);


  /* ==========================================================================
     8. SESSION RESTORE
     ========================================================================== */

  const restoreSession = useCallback(async () => {

    setAuthLoading(true);
    setAuthError(null);

    try {

      const response = await apiGet("/auth/me");

      const authenticatedUser =
        response?.user ??
        response?.data?.user ??
        response?.data ??
        null;

      if (authenticatedUser) {
        setUser(authenticatedUser);
        writeStoredUser(authenticatedUser);
      } else {
        setUser(null);
        writeStoredUser(null);
      }

      return authenticatedUser;

    } catch (error) {

      /*
       * A missing/expired session is a normal unauthenticated state.
       * Do not expose it as a fatal application error.
       */
      setUser(null);
      writeStoredUser(null);

      setAuthError(
        error?.status === 401
          ? null
          : error?.message || "Unable to restore session."
      );

      return null;

    } finally {

      setAuthLoading(false);

    }

  }, []);


  /* ==========================================================================
     9. INITIAL AUTHENTICATION CHECK
     ========================================================================== */

  useEffect(() => {

    let mounted = true;

    const initialize = async () => {

      const restoredUser = await restoreSession();

      if (!mounted) {
        return;
      }

      /*
       * restoreSession already owns the authoritative backend result.
       * The locally stored user is only a temporary UI hint.
       */
      if (!restoredUser) {
        setUser(null);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };

  }, [restoreSession]);


  /* ==========================================================================
     10. LOGIN
     ========================================================================== */

  const login = useCallback(async (credentials) => {

    setAuthLoading(true);
    setAuthError(null);

    try {

      if (!credentials || typeof credentials !== "object") {
        throw new Error("Login credentials are required.");
      }

      const response = await apiPost(
        "/auth/login",
        credentials
      );

      const authenticatedUser =
        response?.user ??
        response?.data?.user ??
        response?.data ??
        null;

      if (!authenticatedUser) {
        throw new Error(
          "Login succeeded but no user session was returned."
        );
      }

      setUser(authenticatedUser);
      writeStoredUser(authenticatedUser);

      return {
        success: true,
        user: authenticatedUser,
        response,
      };

    } catch (error) {

      setUser(null);
      writeStoredUser(null);

      const message =
        error?.message ||
        "Unable to sign in.";

      setAuthError(message);

      return {
        success: false,
        error: message,
      };

    } finally {

      setAuthLoading(false);

    }

  }, []);


  /* ==========================================================================
     11. LOGOUT
     ========================================================================== */

  const logout = useCallback(async () => {

    setAuthLoading(true);
    setAuthError(null);

    try {

      await apiPost("/auth/logout");

    } catch (error) {

      /*
       * Local authentication state is still cleared even if the backend
       * logout request fails. The next request must not continue using
       * stale frontend authentication state.
       */

      setAuthError(
        error?.status === 401
          ? null
          : error?.message || "Logout request failed."
      );

    } finally {

      setUser(null);
      writeStoredUser(null);

      setBrokerState({
        accounts: [],
        plugins: [],
        connected: false,
        primaryAccount: null,
        loading: false,
        error: null,
      });

      setEmergencyState({
        enabled: false,
        active: false,
        reason: null,
      });

      setAuthLoading(false);

    }

  }, []);


  /* ==========================================================================
     12. AUTH STATE HELPERS
     ========================================================================== */

  const isAuthenticated = Boolean(user);

  const hasRole = useCallback((role) => {

    if (!user || !role) {
      return false;
    }

    const roles = Array.isArray(user.roles)
      ? user.roles
      : user.role
        ? [user.role]
        : [];

    return roles.includes(role);

  }, [user]);


  const hasPermission = useCallback((permission) => {

    if (!user || !permission) {
      return false;
    }

    const permissions = Array.isArray(user.permissions)
      ? user.permissions
      : [];

    return permissions.includes(permission);

  }, [user]);


  /* ==========================================================================
     13. USER UPDATE
     ========================================================================== */

  const updateUser = useCallback((nextUser) => {

    setUser(nextUser || null);
    writeStoredUser(nextUser || null);

  }, []);


  /* ==========================================================================
     14. GLOBAL ERROR
     ========================================================================== */

  const clearGlobalError = useCallback(() => {
    setGlobalError(null);
  }, []);


  const setApplicationError = useCallback((error) => {

    if (!error) {
      setGlobalError(null);
      return;
    }

    setGlobalError(
      typeof error === "string"
        ? error
        : error?.message || "An unexpected error occurred."
    );

  }, []);


  /* ==========================================================================
     15. BROKER STATE ACTIONS
     ========================================================================== */

  const updateBrokerState = useCallback((patch) => {

    setBrokerState((current) => ({
      ...current,
      ...(patch || {}),
    }));

  }, []);


  const setBrokerAccounts = useCallback((accounts) => {

    const normalizedAccounts = Array.isArray(accounts)
      ? accounts
      : [];

    const primaryAccount =
      normalizedAccounts.find(
        (account) =>
          account?.is_primary === true ||
          account?.primary === true
      ) ||
      normalizedAccounts.find(
        (account) =>
          account?.connected === true ||
          account?.status === "connected"
      ) ||
      normalizedAccounts[0] ||
      null;

    setBrokerState((current) => ({
      ...current,
      accounts: normalizedAccounts,
      primaryAccount,
      connected: normalizedAccounts.some(
        (account) =>
          account?.connected === true ||
          account?.status === "connected"
      ),
    }));

  }, []);


  /* ==========================================================================
     16. SYSTEM STATE ACTIONS
     ========================================================================== */

  const updateSystemState = useCallback((patch) => {

    setSystemState((current) => ({
      ...current,
      ...(patch || {}),
    }));

  }, []);


  /* ==========================================================================
     17. EMERGENCY STATE ACTIONS
     ========================================================================== */

  const updateEmergencyState = useCallback((patch) => {

    setEmergencyState((current) => ({
      ...current,
      ...(patch || {}),
    }));

  }, []);


  /* ==========================================================================
     18. GLOBAL LOADING
     ========================================================================== */

  const startGlobalLoading = useCallback(() => {
    setGlobalLoading(true);
  }, []);


  const stopGlobalLoading = useCallback(() => {
    setGlobalLoading(false);
  }, []);


  /* ==========================================================================
     19. CONTEXT VALUE
     ========================================================================== */

  const value = useMemo(() => ({
    
    /* Authentication */
    user,
    setUser: updateUser,
    isAuthenticated,
    authLoading,
    authError,
    login,
    logout,
    restoreSession,
    hasRole,
    hasPermission,

    /* Theme */
    theme,
    setTheme,
    toggleTheme,
    isDarkMode: theme === THEMES.DARK,
    isLightMode: theme === THEMES.LIGHT,

    /* Broker */
    brokerState,
    setBrokerState: updateBrokerState,
    setBrokerAccounts,

    /* System */
    systemState,
    setSystemState: updateSystemState,

    /* Emergency */
    emergencyState,
    setEmergencyState: updateEmergencyState,

    /* Global application state */
    globalLoading,
    startGlobalLoading,
    stopGlobalLoading,

    globalError,
    setGlobalError: setApplicationError,
    clearGlobalError,

  }), [
    user,
    updateUser,
    isAuthenticated,
    authLoading,
    authError,
    login,
    logout,
    restoreSession,
    hasRole,
    hasPermission,

    theme,
    setTheme,
    toggleTheme,

    brokerState,
    updateBrokerState,
    setBrokerAccounts,

    systemState,
    updateSystemState,

    emergencyState,
    updateEmergencyState,

    globalLoading,
    startGlobalLoading,
    stopGlobalLoading,

    globalError,
    setApplicationError,
    clearGlobalError,
  ]);


  /* ==========================================================================
     20. PROVIDER OUTPUT
     ========================================================================== */

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}


/* ==========================================================================
   21. HOOK
   ========================================================================== */

export function useApp() {

  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      "useApp must be used inside <AppProvider>."
    );
  }

  return context;
}


/* ==========================================================================
   22. SPECIALIZED HOOKS
   ========================================================================== */

export function useAuth() {

  const {
    user,
    setUser,
    isAuthenticated,
    authLoading,
    authError,
    login,
    logout,
    restoreSession,
    hasRole,
    hasPermission,
  } = useApp();

  return {
    user,
    setUser,
    isAuthenticated,
    authLoading,
    authError,
    login,
    logout,
    restoreSession,
    hasRole,
    hasPermission,
  };
}


export function useTheme() {

  const {
    theme,
    setTheme,
    toggleTheme,
    isDarkMode,
    isLightMode,
  } = useApp();

  return {
    theme,
    setTheme,
    toggleTheme,
    isDarkMode,
    isLightMode,
  };
}


export function useBrokerState() {

  const {
    brokerState,
    setBrokerState,
    setBrokerAccounts,
  } = useApp();

  return {
    brokerState,
    setBrokerState,
    setBrokerAccounts,
  };
}


export function useSystemState() {

  const {
    systemState,
    setSystemState,
  } = useApp();

  return {
    systemState,
    setSystemState,
  };
}


export function useEmergencyState() {

  const {
    emergencyState,
    setEmergencyState,
  } = useApp();

  return {
    emergencyState,
    setEmergencyState,
  };
}


/* ==========================================================================
   END OF OWNER TRADING GLOBAL CONTEXT
   ========================================================================== */
