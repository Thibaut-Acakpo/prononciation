import { Plus, Sparkles, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/**
 * Affiche, phonème par phonème, ce qui a été bien prononcé (vert), substitué
 * par un autre son (orange, avec le son réellement entendu en dessous),
 * complètement oublié (rouge barré), ou ajouté en trop (violet).
 *
 * `alignment` vient directement de compute_phoneme_alignment() côté Python
 * (backend/python/analyze_request.py), transmis tel quel par le backend. Les
 * comptes Premium reçoivent en plus un champ `tip` par son problématique
 * (voir backend/phonemeTips.js) — jamais renvoyé aux comptes gratuits.
 */
export default function PhonemeDiff({ alignment }) {
  const { isPremiumEffective } = useAuth();
  const navigate = useNavigate();

  if (!alignment || alignment.length === 0) return null;

  const problems = alignment.filter((op) => op.type !== "match" && op.type !== "insertion");
  const hasIssues = alignment.some((op) => op.type !== "match");
  const tips = problems.filter((op) => op.tip);

  return (
    <div className="phoneme-diff">
      <div className="phoneme-diff__row">
        {alignment.map((op, i) => (
          <PhonemeChip key={i} op={op} />
        ))}
      </div>

      <div className="phoneme-diff__legend">
        <span><span className="phoneme-chip phoneme-chip--match">a</span> correct</span>
        <span><span className="phoneme-chip phoneme-chip--sub">a</span> son différent</span>
        <span><span className="phoneme-chip phoneme-chip--del">a</span> oublié</span>
        <span><span className="phoneme-chip phoneme-chip--ins">a</span> ajouté en trop</span>
      </div>

      {!hasIssues && (
        <p className="phoneme-diff__perfect">Tous les sons sont corrects, bravo !</p>
      )}

      {hasIssues && isPremiumEffective && tips.length > 0 && (
        <div className="phoneme-tips">
          <strong><Sparkles size={14} color="var(--c-warning)" /> Conseils d'articulation</strong>
          {tips.map((op, i) => (
            <p key={i}><span className="phoneme-tips__symbol">{op.ref}</span> {op.tip}</p>
          ))}
        </div>
      )}

      {hasIssues && !isPremiumEffective && (
        <button className="phoneme-tips-locked" onClick={() => navigate("/premium")}>
          <Lock size={14} /> Débloquer les conseils d'articulation détaillés (Premium)
        </button>
      )}
    </div>
  );
}

function PhonemeChip({ op }) {
  if (op.type === "match") {
    return (
      <span className="phoneme-chip phoneme-chip--match" title="Son correct">
        {op.ref}
      </span>
    );
  }

  if (op.type === "substitution") {
    return (
      <span className="phoneme-chip phoneme-chip--sub" title={`Tu as prononcé "${op.ext}" au lieu de "${op.ref}"`}>
        {op.ref}
        <span className="phoneme-chip__heard">{op.ext}</span>
      </span>
    );
  }

  if (op.type === "deletion") {
    return (
      <span className="phoneme-chip phoneme-chip--del" title="Ce son n'a pas été entendu">
        {op.ref}
      </span>
    );
  }

  // insertion : un son en trop, pas présent dans le mot de référence
  return (
    <span className="phoneme-chip phoneme-chip--ins" title="Son ajouté, absent du mot attendu">
      <Plus size={10} />
      {op.ext}
    </span>
  );
}
