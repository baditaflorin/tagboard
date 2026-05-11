import { useState } from "react";
import type { TagNote } from "../lib/yjsRoom";

export function TagNotesModal({
  tagId,
  notes,
  myUserId,
  onAdd,
  onDelete,
  onClose,
}: {
  tagId: number;
  notes: TagNote[];
  myUserId: string;
  onAdd: (text: string) => void;
  onDelete: (noteId: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Tag #{tagId}</h2>
          <button onClick={onClose}>close</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {notes.length === 0 ? (
            <small>No notes yet. Add the first one below.</small>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                style={{
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  borderLeft: `4px solid ${n.authorColor}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 13,
                  whiteSpace: "pre-wrap",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div>{n.text}</div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--fg-dim)",
                      marginTop: 4,
                    }}
                  >
                    {n.authorName}
                  </div>
                </div>
                {n.authorId === myUserId && (
                  <button
                    onClick={() => onDelete(n.id)}
                    style={{ padding: "2px 6px", fontSize: 12 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <textarea
          placeholder="add a note to this tag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
        />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="primary" onClick={submit} disabled={!text.trim()}>
            Add note
          </button>
        </div>
      </div>
    </div>
  );
}
