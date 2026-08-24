import { useState } from "react";
import { Keyboard, ArrowRight } from "lucide-react";

// Même règle que côté serveur (backend/wordList.js isValidFreeWord) : lettres,
// apostrophes et tirets uniquement, 30 caractères max. Dupliquée ici
// volontairement pour donner un retour immédiat à la frappe, mais le
// serveur revalide toujours indépendamment — jamais confiance au seul frontend.
const FREE_WORD_RE = /^[a-zA-Z][a-zA-Z'-]{0,29}$/;

export default function FreeWordInput({ onConfirm }) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const isValid = FREE_WORD_RE.test(trimmed);

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (isValid) onConfirm(trimmed.toLowerCase());
  }

  return (
    <div className="free-word-input">
      <div className="free-word-input__icon"><Keyboard size={28} /></div>
      <p>Tape n'importe quel mot anglais à travailler — pas besoin qu'il fasse partie des 80 objets illustrés.</p>

      <form onSubmit={handleSubmit} className="free-word-input__form">
        <input
          type="text"
          placeholder="Ex. beautiful, restaurant, Wednesday…"
          value={value}
          onChange={(e) => { setValue(e.target.value); setTouched(false); }}
          maxLength={30}
          autoFocus
        />
        <button type="submit" className="hero__cta" disabled={!trimmed}>
          Continuer <ArrowRight size={16} />
        </button>
      </form>

      {touched && !isValid && trimmed && (
        <p className="auth-panel__error">
          Lettres uniquement (apostrophes et tirets autorisés), 30 caractères max.
        </p>
      )}
    </div>
  );
}
