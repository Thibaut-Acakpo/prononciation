import { useState } from "react";
import { MailWarning, Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function EmailVerifyBanner() {
  const { user, resendVerificationEmail } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (!user || user.email_verified) return null;

  async function handleResend() {
    setSending(true);
    setError("");
    try {
      await resendVerificationEmail();
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="email-verify-banner-wrap">
      <div className="email-verify-banner">
        <MailWarning size={18} color="var(--c-warning)" />
        <div className="email-verify-banner__text">
          <strong>Confirme ton adresse email</strong>
          {sent ? "Email envoyé — pense à vérifier tes spams." : error || `Un lien de confirmation a été envoyé à ${user.email}.`}
        </div>
        <button onClick={handleResend} disabled={sending || sent}>
          {sending ? <Loader2 className="spin" size={14} /> : sent ? "Envoyé ✓" : "Renvoyer"}
        </button>
      </div>
    </div>
  );
}
