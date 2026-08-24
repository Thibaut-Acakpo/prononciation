import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ToastProvider } from "./lib/ToastContext.jsx";
import { ThemeProvider } from "./lib/ThemeContext.jsx";

// Remarque : pas de <StrictMode> ici volontairement. StrictMode monte
// délibérément chaque composant deux fois en développement pour détecter les
// effets de bord mal nettoyés — ce qui est utile pour du code classique, mais
// catastrophique pour l'accès matériel (caméra/micro) : la 2ᵉ tentative
// d'ouverture de la caméra arrive parfois avant que le système d'exploitation
// ait fini de libérer la 1ère, ce qui déclenche à tort "caméra déjà utilisée"
// (NotReadableError) alors qu'aucune autre application ne l'utilise réellement.
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);
