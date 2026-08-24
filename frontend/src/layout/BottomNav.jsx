import { NavLink } from "react-router-dom";
import { Home, Target, BarChart3, User, Swords } from "lucide-react";

const TABS = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/practice", label: "Entraînement", icon: Target },
  { to: "/match", label: "Match", icon: Swords, fab: true },
  { to: "/history", label: "Progrès", icon: BarChart3 },
  { to: "/profile", label: "Profil", icon: User },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      <div className="bottom-nav__inner">
        {TABS.map(({ to, label, icon: Icon, end, fab }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `bottom-nav__item${isActive ? " active" : ""}${fab ? " bottom-nav__item--fab" : ""}`}
          >
            {fab ? (
              <span className="bottom-nav__fab">
                <Icon size={24} strokeWidth={2.2} />
              </span>
            ) : (
              <span className="bottom-nav__frame">
                <Icon size={21} strokeWidth={2} />
              </span>
            )}
            <span className="bottom-nav__label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
