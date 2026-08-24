import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { WORDS, getWordInfo } from "../lib/words";

/**
 * Remplace le <select> HTML natif (moche, non stylable de façon fiable
 * entre navigateurs — voir la capture d'écran où il apparaît comme un menu
 * système générique) par un vrai composant, cohérent avec le design du
 * reste de l'application, avec recherche et vignette de l'objet.
 */
export default function WordDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);

  const selected = getWordInfo(value);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = WORDS.filter(
    (w) =>
      w.word.toLowerCase().includes(search.toLowerCase()) ||
      w.fr.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(word) {
    onChange(word);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="word-dropdown" ref={rootRef}>
      <button
        type="button"
        className="word-dropdown__trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="word-dropdown__trigger-thumb">
          {selected.image ? (
            <img src={selected.image} alt="" />
          ) : (
            <span className="word-dropdown__emoji">{selected.emoji || "?"}</span>
          )}
        </span>
        <span className="word-dropdown__trigger-text">
          {selected.word}
          <span className="word-dropdown__trigger-fr">{selected.fr}</span>
        </span>
        <ChevronDown size={18} className={open ? "rotated" : ""} />
      </button>

      {open && (
        <div className="word-dropdown__panel">
          <div className="word-dropdown__search">
            <Search size={15} />
            <input
              autoFocus
              type="text"
              placeholder="Rechercher un mot…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="word-dropdown__list">
            {filtered.length === 0 && (
              <div className="word-dropdown__empty">Aucun mot ne correspond.</div>
            )}
            {filtered.map((item) => (
              <button
                key={item.word}
                type="button"
                className={`word-dropdown__item${item.word === value ? " selected" : ""}`}
                onClick={() => handleSelect(item.word)}
              >
                <span className="word-dropdown__item-thumb">
                  {item.image ? (
                    <img src={item.image} alt="" />
                  ) : (
                    <span className="word-dropdown__emoji">{item.emoji || "?"}</span>
                  )}
                </span>
                <span className="word-dropdown__item-text">
                  {item.word}
                  <span className="word-dropdown__item-fr">{item.fr}</span>
                </span>
                {item.word === value && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
