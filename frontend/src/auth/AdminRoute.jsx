import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function AdminRoute({ children }) {
  const { user, checking } = useAuth();

  if (checking) return null; // évite un redirect prématuré pendant la vérification de session

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
