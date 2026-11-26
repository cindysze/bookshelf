import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

// colors from the shelf designs
const COLORS = [
  "#2F4BA0", "#D2462E", "#1C2440", "#E8C15A", "#8FA37E",
  "#E7A9B5", "#2E4A3F", "#5A4A78", "#B5653A", "#2F5D6B",
];

function formatDate(iso) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function visibilityLabel(v) {
  if (v === "private") return "Private";
  if (v === "selected") return "Shared with some friends";
  return "Friends can read";
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function loadWidth(key, fallback) {
  try {
    return Number(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // sidebar
  const [journals, setJournals] = useState([]);
  const [looseCount, setLooseCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null); // null = loose pages
  const [addingJournal, setAddingJournal] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // pages + editor
  const [pages, setPages] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [status, setStatus] = useState("");
  const [showColors, setShowColors] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // loose pages
  const [capture, setCapture] = useState("");
  const captureRef = useRef(null);

  // search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = not searching
  const pendingPageRef = useRef(null); // a page to open once its journal loads

  // resizable columns
  const [sidebarW, setSidebarW] = useState(() => loadWidth("sidebarW", 248));
  const [listW, setListW] = useState(() => loadWidth("listW", 300));

  const selected = journals.find((j) => j._id === selectedId);
  const journalById = (id) => journals.find((j) => j._id === id);

  // ---------- loading ----------
  function loadJournals() {
    fetch(`${API}/journals`)
      .then((res) => res.json())
      .then((data) => setJournals(data));
    fetch(`${API}/pages`)
      .then((res) => res.json())
      .then((data) => setLooseCount(data.length));
  }

  function loadPages() {
    const q = selectedId ? `?journal_id=${selectedId}` : "";
    fetch(`${API}/pages${q}`)
      .then((res) => res.json())
      .then((data) => {
        setPages(data);
        if (pendingPageRef.current) {
          const p = data.find((x) => x._id === pendingPageRef.current);
          pendingPageRef.current = null;
          if (p) openPage(p);
        }
      });
  }

  useEffect(() => {
    loadJournals();
  }, []);

  useEffect(() => {
    loadPages();
    startNewPage();
    setShowColors(false);
    setRenaming(false);
  }, [selectedId]);

  // search a moment after you stop typing
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`${API}/search?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setResults(data));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // remember column widths
  useEffect(() => {
    try {
      localStorage.setItem("sidebarW", sidebarW);
      localStorage.setItem("listW", listW);
    } catch {
      /* storage unavailable; widths just won't be remembered */
    }
  }, [sidebarW, listW]);

  // ---------- helpers ----------
  function send(url, method, body) {
    return fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      return res.json();
    });
  }

  // ---------- journals ----------
  function createJournal(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    send(`${API}/journals`, "POST", { title: newTitle })
      .then((journal) => {
        setNewTitle("");
        setAddingJournal(false);
        loadJournals();
        setSelectedId(journal._id);
      })
      .catch((err) => alert(`Couldn't create journal: ${err.message}`));
  }

  function changeColor(color) {
    send(`${API}/journals/${selectedId}`, "PATCH", { cover: { color } })
      .then(() => loadJournals())
      .catch((err) => alert(`Couldn't change color: ${err.message}`));
  }

  function startRename() {
    setNameDraft(selected.title);
    setRenaming(true);
  }

  function renameJournal(e) {
    e?.preventDefault();
    const name = nameDraft.trim();
    if (!name || name === selected.title) return setRenaming(false);
    send(`${API}/journals/${selectedId}`, "PATCH", { title: name })
      .then(() => {
        setRenaming(false);
        loadJournals();
      })
      .catch((err) => alert(`Couldn't rename: ${err.message}`));
  }

  // ---------- editor ----------
  function startNewPage() {
    setEditingId(null);
    setDraftTitle("");
    setDraftBody("");
    setStatus("");
  }

  function openPage(page) {
    setEditingId(page._id);
    setDraftTitle(page.title);
    setDraftBody(page.body);
    setStatus("Saved");
  }

  function savePage() {
    if (!draftBody.trim()) return alert("Write something first!");
    const isNew = editingId === null;
    setStatus("Saving…");
    const request = isNew
      ? send(`${API}/pages`, "POST", { journal_id: selectedId, title: draftTitle, body: draftBody })
      : send(`${API}/pages/${editingId}`, "PATCH", { title: draftTitle, body: draftBody });

    request
      .then((saved) => {
        setEditingId(saved._id);
        setStatus("Saved");
        loadPages();
        loadJournals();
      })
      .catch((err) => {
        setStatus("Not saved");
        alert(`Couldn't save: ${err.message}`);
      });
  }

  function handleEditorKeys(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      savePage();
    }
  }

  // ---------- loose pages ----------
  function saveCapture(e) {
    e?.preventDefault();
    if (!capture.trim()) return;
    send(`${API}/pages`, "POST", { body: capture })
      .then(() => {
        setCapture("");
        loadPages();
        loadJournals();
      })
      .catch((err) => alert(`Couldn't save: ${err.message}`));
  }

  function handleCaptureKeys(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveCapture();
    }
  }

  function fileInto(pageId, journalId) {
    send(`${API}/pages/${pageId}`, "PATCH", { journal_id: journalId })
      .then(() => {
        loadPages();
        loadJournals();
      })
      .catch((err) => alert(`Couldn't file page: ${err.message}`));
  }

  function goToCapture() {
    setQuery("");
    setSelectedId(null);
    setTimeout(() => captureRef.current?.focus(), 0);
  }

  // ---------- search ----------
  function openFromSearch(page) {
    setQuery("");
    if (page.journal_id === null) {
      setSelectedId(null);
    } else if (page.journal_id === selectedId) {
      openPage(page);
    } else {
      pendingPageRef.current = page._id;
      setSelectedId(page.journal_id);
    }
  }

  // ---------- screen ----------
  return (
    <div className="app">
      {/* ---------- sidebar ---------- */}
      <nav className="sidebar" style={{ width: sidebarW }} aria-label="Journals">
        <div className="brand-row">
          <span className="brand">shelf</span>
          <span className="avatar" aria-label="Your profile">C</span>
        </div>

        <label htmlFor="search" className="visually-hidden">Search everything</label>
        <input
          id="search"
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Search everything"
        />

        <button className="nav-item strong" onClick={selected && !results ? startNewPage : goToCapture}>
          <span className="nav-left"><PlusIcon />New page</span>
        </button>

        <button
          className={`nav-item ${selectedId === null && !results ? "active" : ""}`}
          onClick={() => {
            setQuery("");
            setSelectedId(null);
          }}
        >
          <span className="nav-left"><TrayIcon />Loose pages</span>
          {looseCount > 0 && <span className="badge">{looseCount}</span>}
        </button>

        <p className="label">Journals</p>
        {journals.map((j) => (
          <button
            key={j._id}
            className={`nav-item ${selectedId === j._id && !results ? "active" : ""}`}
            onClick={() => {
              setQuery("");
              setSelectedId(j._id);
            }}
          >
            <span className="nav-left">
              <span className="spine-mark" style={{ background: j.cover.color }} />
              <span className="name">{j.title}</span>
              {j.visibility === "private" && <LockIcon />}
            </span>
            <span className="count">{j.page_count}</span>
          </button>
        ))}

        {addingJournal ? (
          <form className="new-journal" onSubmit={createJournal}>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={() => !newTitle.trim() && setAddingJournal(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setNewTitle("");
                  setAddingJournal(false);
                }
              }}
              placeholder="Journal name"
              aria-label="New journal name"
            />
          </form>
        ) : (
          <button className="nav-item muted" onClick={() => setAddingJournal(true)}>
            + New journal
          </button>
        )}

        <p className="label">Friends</p>
        <p className="soon">Friends' shelves will show up here once logins are set up.</p>
      </nav>

      <Resizer onDrag={(dx) => setSidebarW((w) => clamp(w + dx, 190, 400))} />

      {results !== null ? (
        /* ---------- search results ---------- */
        <main className="loose">
          <div className="loose-inner">
            <h1>Search</h1>
            <p className="sub">
              {results.length} {results.length === 1 ? "result" : "results"} for “{query}”
            </p>
            {results.map((p) => {
              const j = journalById(p.journal_id);
              return (
                <button key={p._id} className="result" onClick={() => openFromSearch(p)}>
                  <span className="result-top">
                    <span className="page-title">{p.title || "Untitled"}</span>
                    <span className="page-meta">{formatDate(p.updated_at)}</span>
                  </span>
                  <span className="page-preview">{p.body}</span>
                  <span className="result-where">
                    {j ? (
                      <>
                        <span className="spine-mark" style={{ background: j.cover.color }} />
                        {j.title}
                      </>
                    ) : (
                      "Loose page"
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </main>
      ) : selected ? (
        <>
          {/* ---------- page list ---------- */}
          <section className="page-list" style={{ width: listW }} aria-label={`Pages in ${selected.title}`}>
            <div className="list-header">
              <div className="list-title-row">
                {renaming ? (
                  <form onSubmit={renameJournal} className="rename-form">
                    <input
                      autoFocus
                      className="rename-input"
                      value={nameDraft}
                      maxLength={40}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={renameJournal}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
                      aria-label="Journal name"
                    />
                  </form>
                ) : (
                  <h1>
                    <button className="title-btn" onClick={startRename} title="Click to rename">
                      {selected.title}
                    </button>
                  </h1>
                )}
                <button
                  className="color-btn"
                  style={{ background: selected.cover.color }}
                  onClick={() => setShowColors((s) => !s)}
                  aria-label="Change journal color"
                  aria-expanded={showColors}
                />
              </div>
              <p>
                {pages.length} {pages.length === 1 ? "page" : "pages"} ·{" "}
                {visibilityLabel(selected.visibility).toLowerCase()}
              </p>
              {showColors && (
                <div className="swatches" role="group" aria-label="Journal color">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${selected.cover.color === c ? "on" : ""}`}
                      style={{ background: c }}
                      onClick={() => changeColor(c)}
                      aria-label={`Color ${c}`}
                      aria-pressed={selected.cover.color === c}
                    />
                  ))}
                </div>
              )}
            </div>

            {pages.length === 0 && <p className="empty">No pages yet. Start writing →</p>}

            {pages.map((p) => (
              <button
                key={p._id}
                className={`page-row ${editingId === p._id ? "active" : ""}`}
                style={{ borderLeftColor: editingId === p._id ? selected.cover.color : "transparent" }}
                onClick={() => openPage(p)}
              >
                <span className="page-title">{p.title || "Untitled"}</span>
                <span className="page-preview">{p.body}</span>
                <span className="page-meta">{formatDate(p.updated_at)}</span>
              </button>
            ))}
          </section>

          <Resizer onDrag={(dx) => setListW((w) => clamp(w + dx, 220, 520))} />

          {/* ---------- editor ---------- */}
          <main className="editor" onKeyDown={handleEditorKeys}>
            <div className="editor-bar">
              <span>
                {selected.title}
                {status && ` · ${status}`}
              </span>
              <span className="bar-actions">
                <span className="pill">{visibilityLabel(selected.visibility)}</span>
                <button className="save-btn" onClick={savePage}>
                  {editingId ? "Save" : "Save page"} <kbd>⌘S</kbd>
                </button>
              </span>
            </div>

            <div className="editor-inner">
              <input
                className="title-input"
                value={draftTitle}
                onChange={(e) => {
                  setDraftTitle(e.target.value);
                  setStatus("Unsaved");
                }}
                placeholder="Untitled"
                aria-label="Page title"
              />
              <textarea
                className="body-input"
                value={draftBody}
                onChange={(e) => {
                  setDraftBody(e.target.value);
                  setStatus("Unsaved");
                }}
                placeholder="Write something down…"
                aria-label="Page body"
              />
            </div>
          </main>
        </>
      ) : (
        /* ---------- loose pages ---------- */
        <main className="loose">
          <div className="loose-inner">
            <h1>Loose pages</h1>
            <p className="sub">Quick thoughts land here first. Give each one a home so it doesn't get lost.</p>

            <form className="capture" onSubmit={saveCapture}>
              <label htmlFor="capture">Quick capture</label>
              <textarea
                id="capture"
                ref={captureRef}
                rows={2}
                value={capture}
                onChange={(e) => setCapture(e.target.value)}
                onKeyDown={handleCaptureKeys}
                placeholder="Write something down…"
              />
              <div className="capture-foot">
                <span>Press Enter to save · Shift + Enter for a new line</span>
                <button type="submit" className="save-btn">Save</button>
              </div>
            </form>

            {pages.length === 0 && <p className="empty">Nothing loose. Everything has a home.</p>}

            {pages.map((p) => (
              <article key={p._id} className="loose-item">
                <div className="loose-top">
                  <p className="loose-text">{p.title ? `${p.title}: ${p.body}` : p.body}</p>
                  <span className="page-meta">{formatDate(p.updated_at)}</span>
                </div>
                {journals.length > 0 ? (
                  <div className="file-row">
                    <span className="hint">File into</span>
                    {journals.map((j) => (
                      <button key={j._id} className="chip" onClick={() => fileInto(p._id, j._id)}>
                        <span className="spine-mark" style={{ background: j.cover.color }} />
                        {j.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hint">Make a journal in the sidebar to file this.</p>
                )}
              </article>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}

/* ---------- drag handle between columns ---------- */
function Resizer({ onDrag }) {
  function start(e) {
    e.preventDefault();
    let lastX = e.clientX;
    function move(ev) {
      onDrag(ev.clientX - lastX);
      lastX = ev.clientX;
    }
    function stop() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      document.body.classList.remove("resizing");
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    document.body.classList.add("resizing");
  }
  return <div className="resizer" onMouseDown={start} role="separator" aria-orientation="vertical" />;
}

/* ---------- little icons ---------- */
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
function TrayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 9l2-6h8l2 6v4H2z" />
      <path d="M2 9h4l1 2h2l1-2h4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#8A8880" strokeWidth="1.4" role="img" aria-label="Private">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}
