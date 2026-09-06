
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const ThemeContext = createContext(null);

const THEME_STORAGE_KEY = "owner-trading-theme";
const DEFAULT_THEME = "dark";

const VALID_THEMES = new Set(["dark", "light"]);

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return DEFAULT_THEME;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function getStoredTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (VALID_THEMES.has(storedTheme)) {
      return storedTheme;
    }
  } catch {
    // localStorage can be unavailable in private/restricted browser contexts.
  }

  /*
   * The application is currently dark-first, so if there is no saved
   * preference we preserve the existing Owner Trading appearance.
   *
   * System preference is used only when explicitly requested through
   * the reset-to-system action.
   */
  return DEFAULT_THEME;
}

function applyTheme(theme) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const normalizedTheme = VALID_THEMES.has(theme)
    ? theme
    : DEFAULT_THEME;

  /*
   * Primary theme contract used by index.css.
   */
  root.dataset.theme = normalizedTheme;

  /*
   * Backward compatibility with the existing application, which currently
   * applies a `.dark` class at the application root.
   *
   * This allows the theme system to be introduced without breaking existing
   * dark-mode selectors while App.js/AppShell are migrated.
   */
  root.classList.toggle("dark", normalizedTheme === "dark");

  /*
   * Keep browser-native controls, form controls and scrollbars aligned
   * with the selected application theme.
   */
  root.style.colorScheme = normalizedTheme;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme);

  /*
   * Apply the initial theme immediately whenever ThemeProvider mounts
   * and whenever the selected theme changes.
   */
  useEffect(() => {
    applyTheme(theme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Continue normally when persistent browser storage is unavailable.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark"
    );
  }, []);

  const setThemeMode = useCallback((nextTheme) => {
    if (!VALID_THEMES.has(nextTheme)) {
      return;
    }

    setTheme(nextTheme);
  }, []);

  const resetToSystemTheme = useCallback(() => {
    setTheme(getSystemTheme());
  }, []);

  /*
   * Keep the application synchronized when the operating-system/browser
   * theme changes after the user has explicitly reset to system preference.
   *
   * We intentionally do not automatically override a user's explicit
   * dark/light selection.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    let followsSystemTheme = false;

    try {
      followsSystemTheme =
        window.localStorage.getItem(THEME_STORAGE_KEY) === null;
    } catch {
      followsSystemTheme = false;
    }

    if (!followsSystemTheme) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

    const handleSystemThemeChange = (event) => {
      setTheme(event.matches ? "light" : "dark");
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);

      return () => {
        mediaQuery.removeEventListener(
          "change",
          handleSystemThemeChange
        );
      };
    }

    /*
     * Safari/older browser compatibility.
     */
    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleSystemThemeChange);

      return () => {
        mediaQuery.removeListener(handleSystemThemeChange);
      };
    }

    return undefined;
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      isLight: theme === "light",
      toggleTheme,
      setTheme: setThemeMode,
      resetToSystemTheme,
    }),
    [theme, toggleTheme, setThemeMode, resetToSystemTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}

export { THEME_STORAGE_KEY };
