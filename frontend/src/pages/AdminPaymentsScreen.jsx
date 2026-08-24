import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, CircleCheck, CircleX, Clock } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

const STATUS_META = {
  approved: { icon: CircleCheck, color: "var(--c-success)", label: "Confirmé" },
  pending: { icon: Clock, color: "var(--c-warning)", label: "En attente" },
  failed: { icon: CircleX, color: "var(--c-danger)", label: "Échoué" },
};

export default function AdminPaymentsScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState(null);

  useEffect(() => {
    fetch("/api/admin/payments", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setPayments(data.payments || []))
      .catch(() => setPayments([]));
  }, [token]);

  return (
    <div className="screen">
      <TopBar title="Paiements Premium" showBack onBack={() => navigate("/admin")} />

      {!payments ? (
        <p className="screen-hint">Chargement…</p>
      ) : payments.length === 0 ? (
        <p className="screen-hint">Aucun paiement pour le moment.</p>
      ) : (
        <div className="card">
          <ul className="admin-payment-list">
            {payments.map((p) => {
              const meta = STATUS_META[p.status] || STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <li key={p.id} className="admin-payment-list__item" onClick={() => navigate(`/admin/users/${p.user_id}`)}>
                  <div className="admin-payment-list__icon" style={{ color: meta.color }}>
                    <Icon size={20} />
                  </div>
                  <div className="admin-payment-list__info">
                    <strong>{p.display_name || p.email}</strong>
                    <span>{new Date(p.created_at + "Z").toLocaleString("fr-FR")}</span>
                  </div>
                  <div className="admin-payment-list__amount">
                    <strong>{p.amount.toLocaleString("fr-FR")} {p.currency}</strong>
                    <span style={{ color: meta.color }}>{meta.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
