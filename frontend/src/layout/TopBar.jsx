import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sun, Moon } from "lucide-react";
import { useTheme } from "../lib/ThemeContext";

export default function TopBar({ title, showBack = false, onBack, right = null }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="top-bar">
      <div className="top-bar__inner">
        <div className="top-bar__left">
          {showBack && (
            <button
              className="top-bar__back"
              onClick={onBack || (() => navigate(-1))}
              aria-label="Retour"
            >
              <ArrowLeft size={22} />
            </button>
          )}
          <h1 className="top-bar__title">{title}</h1>
        </div>
        <div className="top-bar__right">
          {right}
          <button
            className="top-bar__theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Mode sombre actif — passer en mode clair" : "Mode clair actif — passer en mode sombre"}
            title={theme === "dark" ? "Mode sombre" : "Mode clair"}
          >
            {theme === "dark" ? (
              <><Moon size={17} fill="currentColor" /> <span className="top-bar__theme-label">Sombre</span></>
            ) : (
              <><Sun size={17} fill="currentColor" /> <span className="top-bar__theme-label">Clair</span></>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
