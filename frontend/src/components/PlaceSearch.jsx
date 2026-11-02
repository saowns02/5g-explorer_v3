import { useEffect, useId, useRef, useState } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { api } from '../api/client.js';
import { fmtCoord } from '../lib/places.js';

// Type-ahead place search. Calls onPick(place) with a search result row.
export default function PlaceSearch({ onPick, placeholder = 'Search a city or town', autoFocus = false, className = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const inputId = useId();
  const wrapRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .searchPlaces({ q, limit: 8 })
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setActive(0);
          setOpen(true);
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (row) => {
    onPick(row);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showEmpty = open && !loading && query.trim().length >= 2 && results.length === 0;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        Search places
      </label>
      <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && results.length ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 bg-panel border border-rule rounded text-[15px] placeholder:text-faint outline-none focus:border-ink shadow-[0_1px_2px_rgba(15,27,38,0.08)] [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink"
          aria-label="Clear place search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 mt-1 overlay overflow-hidden z-50 py-1"
        >
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              className={`flex items-start gap-2.5 px-3 py-1.5 cursor-pointer ${i === active ? 'bg-ground' : ''}`}
            >
              <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${i === active ? 'text-ink' : 'text-faint'}`} />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{r.name}</span>
                  <span className="text-xs text-faint tabular whitespace-nowrap">{fmtCoord(r.lat, r.lng)}</span>
                </span>
                <span className="block text-xs text-muted truncate">
                  {r.topOperators.join(', ')}
                  {r.operators > r.topOperators.length ? ` and ${r.operators - r.topOperators.length} more` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {showEmpty && (
        <div className="absolute left-0 right-0 mt-1 overlay px-3 py-2.5 text-xs text-muted z-50">
          No place with 5G listings matches “{query.trim()}”.
        </div>
      )}
    </div>
  );
}
