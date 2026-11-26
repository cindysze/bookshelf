import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function App() {
  // sidebar
  const [journals, setJournals] = useState([]);
  const [looseCount, setLooseCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null); // null = loose pages
  const [newTitle, setNewTitle] = useState("");

  // pages + editor
  const [pages, setPages] = useState([]);
  const [editingId, setEditingId] = useState(null); // null = a brand-new page
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [status, setStatus] = useState("");

  const selected = journals.find((j) => j._id === selectedId);

  function loadJournals() {
    fetch(`${API}/journals`)
      .then((res) => res.json())
      .then((data) => setJournals(data));
    fetch(`${API}/pages`) // loose pages, just to count them for the badge
      .then((res) => res.json())
      .then((data) => setLooseCount(data.length));
  }

  function loadPages() {
    const query = selectedId ? `?journal_id=${selectedId}` : "";
    fetch(`${API}/pages${query}`)
      .then((res) => res.json())
      .then((data) => setPages(data));
  }

  useEffect(() => {
    loadJournals();
  }, []);

  useEffect(() => {
    loadPages();
    startNewPage();
  }, [selectedId]);

  function createJournal(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    fetch(`${API}/journals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then((journal) => {
        setNewTitle("");
        loadJournals();
        setSelectedId(journal._id); // jump into the new journal
      })
      .catch((err) => alert(`Couldn't create journal: ${err.message}`));
  }

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

    fetch(isNew ? `${API}/pages` : `${API}/pages/${editingId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isNew
          ? { journal_id: selectedId, title: draftTitle, body: draftBody }
          : { title: draftTitle, body: draftBody }
      ),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
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

  function fileInto(pageId, journalId) {
    fetch(`${API}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journal_id: journalId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json();
      })
      .then(() => {
        if (editingId === pageId) startNewPage();
        loadPages();
        loadJournals();
      })
      .catch((err) => alert(`Couldn't file page: ${err.message}`));
  }

  // Cmd+S (or Ctrl+S) saves
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      savePage();
    }
  }

  return (
    <div className="app">
      {/* ---------- sidebar ---------- */}
      <nav className="sidebar">
        <div className="brand">shelf</div>

        <button
          className={`nav-item ${selectedId === null ? "active" : ""}`}
          onClick={() => setSelectedId(null)}
        >
          <span className="nav-left">Loose pages</span>
          {looseCount > 0 && <span className="badge">{looseCount}</span>}
        </button>

        <p className="label">Journals</p>
        {journals.map((j) => (
          <button
            key={j._id}
            className={`nav-item ${selectedId === j._id ? "active" : ""}`}
            onClick={() => setSelectedId(j._id)}
          >
            <span className="nav-left">
              <span className="spine-mark" style={{ background: j.cover.color }} />
              <span className="name">{j.title}</span>
            </span>
            <span className="count">{j.page_count}</span>
          </button>
        ))}

        <form className="new-journal" onSubmit={createJournal}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="+ New journal"
          />
        </form>
      </nav>

      {/* ---------- page list ---------- */}
      <section className="page-list">
        <div className="list-header">
          <div>
            <h1>{selected ? selected.title : "Loose pages"}</h1>
            <p>
              {pages.length} {pages.length === 1 ? "page" : "pages"}
              {selected && ` · ${selected.visibility === "private" ? "private" : "visible to friends"}`}
            </p>
          </div>
          <button className="new-page" onClick={startNewPage}>+ New page</button>
        </div>

        {pages.length === 0 && (
          <p className="empty">
            {selected ? "No pages yet. Start writing →" : "Nothing loose. Everything has a home."}
          </p>
        )}

        {pages.map((p) => (
          <div
            key={p._id}
            className={`page-row ${editingId === p._id ? "active" : ""}`}
            style={{ borderLeftColor: editingId === p._id ? selected?.cover.color ?? "#C9A35C" : "transparent" }}
            onClick={() => openPage(p)}
          >
            <div className="page-title">{p.title || "Untitled"}</div>
            <div className="page-preview">{p.body}</div>
            <div className="page-meta">{formatDate(p.updated_at)}</div>

            {selectedId === null && journals.length > 0 && (
              <div className="file-row">
                <span className="hint">File into</span>
                {journals.map((j) => (
                  <button
                    key={j._id}
                    className="chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInto(p._id, j._id);
                    }}
                  >
                    <span className="spine-mark" style={{ background: j.cover.color }} />
                    {j.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ---------- editor ---------- */}
      <main className="editor" onKeyDown={handleKeyDown}>
        <div className="editor-bar">
          <span>
            {selected ? selected.title : "Loose pages"}
            {status && ` · ${status}`}
          </span>
          <button className="save-btn" onClick={savePage}>
            {editingId ? "Save" : "Save page"}
            <kbd>⌘S</kbd>
          </button>
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
          />
          <textarea
            className="body-input"
            value={draftBody}
            onChange={(e) => {
              setDraftBody(e.target.value);
              setStatus("Unsaved");
            }}
            placeholder="Write something down…"
          />
        </div>
      </main>
    </div>
  );
}
