import { useState } from "react";
import { Check, Search, ImageOff, SearchX } from "lucide-react";
import { WORDS } from "../lib/words";

function ObjectCard({ item, onSelect, selected }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`obj-card${selected ? " obj-card--selected" : ""}`}
      onClick={() => onSelect(item.word)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(item.word)}
    >
      <div className="obj-card-img">
        {item.image && !failed ? (
          <img
            src={item.image}
            alt={item.word}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="obj-card-fallback"><ImageOff size={22} strokeWidth={1.6} /></div>
        )}
        {selected && <div className="obj-card-check"><Check size={14} strokeWidth={3} /></div>}
      </div>
      <div className="obj-card-label">
        {item.word}
        <span className="obj-card-label-fr">{item.fr}</span>
      </div>
    </div>
  );
}

export default function ObjectGallery({ selectedWord, onSelectWord }) {
  const [search, setSearch] = useState("");

  const filtered = WORDS.filter(
    (w) =>
      w.word.toLowerCase().includes(search.toLowerCase()) ||
      w.fr.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="gallery-wrapper">
      <div className="gallery-search-row">
        <div className="gallery-search-input">
          <Search size={16} />
          <input
            type="text"
            placeholder="Rechercher un objet…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="gallery-count">{filtered.length} objets</span>
      </div>

      {filtered.length === 0 ? (
        <div className="gallery-empty">
          <SearchX size={32} strokeWidth={1.5} />
          <p>Aucun objet ne correspond à "{search}".</p>
          <p className="gallery-empty__hint">
            Cette application reconnaît 80 objets précis. "{search}" n'en fait pas partie —
            essaie un autre mot ou parcours la liste complète ci-dessous.
          </p>
        </div>
      ) : (
        <div className="gallery-grid">
          {filtered.map((item) => (
            <ObjectCard
              key={item.word}
              item={item}
              onSelect={onSelectWord}
              selected={selectedWord === item.word}
            />
          ))}
        </div>
      )}
    </div>
  );
}
