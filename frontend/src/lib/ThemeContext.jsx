import { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext(null);
const THEME_KEY = "parollle_theme";

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // Pas de préférence enregistrée : on respecte le réglage système de
  // l'utilisateur (prefers-color-scheme) plutôt que d'imposer un choix.
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Applique le thème à <html data-theme="..."> : c'est cet attribut que
  // styles.css utilise pour choisir le jeu de variables CSS (voir le bloc
  // ":root[data-theme='light']" en haut de styles.css).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé à l'intérieur de <ThemeProvider>.");
  return ctx;
}
