// Note Editor — blocks, slash menu, action items, tables with auto-sum, tag chips, drag-reorder

const TAG_BY_ID = {}; // populated lazily

function makeTagMap(tags) {
  if (Object.keys(TAG_BY_ID).length) return TAG_BY_ID;
  for (const t of tags) TAG_BY_ID[t.id] = t;
  return TAG_BY_ID;
}

function tagSwatch(tag) {
  const sat = tag.sat == null ? 60 : tag.sat;
  return `hsl(${tag.hue}, ${sat}%, 50%)`;
}

function NoteEditor({ note, tags, today, onNoteChange, onOpenNote, onPinToggle, onExport, dataAll }) {
  const tagMap = makeTagMap(tags);
  const [slash, setSlash] = useState(null); // {x, y, blockIdx, q}
  const [slashSel, setSlashSel] = useState(0);
  const [drag, setDrag] = useState({ from: null, over: null });
  const [tagPop, setTagPop] = useState(null); // {q}
  const titleRef = useRef(null);

  const update = (mut) => {
    const next = JSON.parse(JSON.stringify(note));
    mut(next);
    next.updated = today;
    onNoteChange(next);
  };

  const setBlock = (i, mut) => update((n) => mut(n.blocks[i]));
  const insertBlock = (i, block) => update((n) => n.blocks.splice(i + 1, 0, block));
  const removeBlock = (i) => update((n) => n.blocks.splice(i, 1));
  const moveBlock = (from, to) => update((n) => {
    if (from === to || from + 1 === to) return;
    const [b] = n.blocks.splice(from, 1);
    n.blocks.splice(from < to ? to - 1 : to, 0, b);
  });

  // slash menu items
  const SLASH = [
    { section: 'basic', items: [
      { key: 'p',  label: 'Text',        hint: 'p',  glyph: '¶', make: () => ({ t: 'p', text: '' }) },
      { key: 'h2', label: 'Section',     hint: 'h2', glyph: '§', make: () => ({ t: 'h2', text: 'Section' }) },
      { key: 'list', label: 'Bulleted list', hint: 'ul', glyph: '—', make: () => ({ t: 'list', items: [''] }) },
    ]},
    { section: 'structured', items: [
      { key: 'action', label: 'Action item', hint: '☐', glyph: '☐', make: () => ({ t: 'action', text: '', owner: 'LP', due: null, done: false }) },
      { key: 'table',  label: 'Table',       hint: 'tbl', glyph: '#', make: () => ({ t: 'table', headers: ['', '', ''], rows: [['','',''],['','','']] }) },
      { key: 'callout', label: 'Thesis callout', hint: '!', glyph: '!', make: () => ({ t: 'callout', tone: 'thesis', text: '' }) },
      { key: 'attendees', label: 'Attendees', hint: '@', glyph: '@', make: () => ({ t: 'attendees', list: [''] }) },
      { key: 'swot', label: 'SWOT 2×2', hint: '2x2', glyph: '⊞', make: () => ({ t: 'swot' }) },
    ]},
  ];
  const FLAT_SLASH = SLASH.flatMap(s => s.items);

  const onTextKey = (e, i, field = 'text') => {
    const b = note.blocks[i];
    const val = (b[field] || '');
    if (e.key === '/' && val === '') {
      const rect = e.target.getBoundingClientRect();
      const editorRect = e.target.closest('.editor').getBoundingClientRect();
      setSlash({ x: rect.left - editorRect.left, y: rect.bottom - editorRect.top + 4, blockIdx: i, q: '' });
      setSlashSel(0);
    }
    if (e.key === 'Enter' && !e.shiftKey && b.t !== 'list' && b.t !== 'action') {
      e.preventDefault();
      insertBlock(i, { t: 'p', text: '' });
      // focus next; small delay to wait for render
      setTimeout(() => {
        const next = document.querySelector(`[data-block-idx="${i+1}"] [contenteditable]`);
        if (next) next.focus();
      }, 0);
    }
    if (e.key === 'Backspace' && val === '' && note.blocks.length > 1 && b.t !== 'h1') {
      e.preventDefault();
      removeBlock(i);
    }
  };

  const filteredSlash = useMemo(() => {
    if (!slash) return FLAT_SLASH;
    const q = (slash.q || '').toLowerCase();
    if (!q) return FLAT_SLASH;
    return FLAT_SLASH.filter(it => it.label.toLowerCase().includes(q) || it.key.includes(q));
  }, [slash]);

  // mouse-up close
  useEffect(() => {
    if (!slash) return;
    const close = (e) => { if (!e.target.closest('.slash-menu')) setSlash(null); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [slash]);

  // global slash keyboard
  useEffect(() => {
    if (!slash) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setSlash(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSel(s => Math.min(filteredSlash.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredSlash[slashSel];
        if (item) {
          update((n) => { n.blocks[slash.blockIdx] = item.make(); });
        }
        setSlash(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slash, slashSel, filteredSlash]);

  const startDrag = (i) => setDrag({ from: i, over: null });
  const endDrag = () => {
    if (drag.from != null && drag.over != null) moveBlock(drag.from, drag.over);
    setDrag({ from: null, over: null });
  };
  const onDragOver = (i, e) => {
    e.preventDefault();
    if (drag.from == null) return;
    setDrag(d => ({ ...d, over: i }));
  };

  const toggleAction = (i) => setBlock(i, (b) => { b.done = !b.done; });

  const computeWordCount = () => {
    let n = 0;
    for (const b of note.blocks) {
      const s = b.text || (b.items || []).join(' ') || '';
      n += s.split(/\s+/).filter(Boolean).length;
    }
    return n;
  };

  // tag handling
  const addTag = (tagId) => update((n) => { if (!n.tags.includes(tagId)) n.tags.push(tagId); });
  const removeTag = (tagId) => update((n) => { n.tags = n.tags.filter(t => t !== tagId); });

  const onTagInput = (val) => setTagPop({ q: val });
  const tagMatches = useMemo(() => {
    if (!tagPop) return [];
    const q = (tagPop.q || '').toLowerCase();
    return tags.filter(t => !note.tags.includes(t.id) && t.label.includes(q)).slice(0, 8);
  }, [tagPop, tags, note.tags]);

  return (
    <div className="editor-pane">
      <div className="editor-head">
        <div className="info">
          <span className="mono">~/notes/{note.id}</span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span><TypeBadge type={note.type} /></span>
          <span style={{ color: 'var(--ink-4)' }}>· edited {relTime(note.updated, today)} · {computeWordCount()} words</span>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => onPinToggle(note.id)}>{note.pinned ? '★ pinned' : '☆ pin'}</button>
          <button className="btn" onClick={() => onExport(note.id, 'md')}>export .md</button>
          <button className="btn" onClick={() => onExport(note.id, 'pdf')}>export .pdf</button>
          <button className="btn primary">share</button>
        </div>
      </div>
      <div className="editor-scroll">
        <div className="editor">
          {note.blocks.map((b, i) => (
            <div
              key={i}
              className={classNames('block', drag.from === i && 'dragging', drag.over === i && 'drop-target')}
              data-block-idx={i}
              onDragOver={(e) => onDragOver(i, e)}
              onDrop={endDrag}
            >
              <span
                className="handle"
                draggable
                onDragStart={() => startDrag(i)}
                onDragEnd={endDrag}
                title="drag to reorder"
              >⋮⋮</span>
              <BlockBody
                block={b}
                idx={i}
                note={note}
                tags={tags}
                tagMap={tagMap}
                today={today}
                onTextKey={onTextKey}
                setBlock={setBlock}
                toggleAction={toggleAction}
                onWikilink={(title) => {
                  const target = dataAll.notes.find(nn => nn.title.toLowerCase() === title.toLowerCase());
                  if (target) onOpenNote(target.id);
                }}
                removeTag={removeTag}
                onTagInput={onTagInput}
                tagPop={tagPop}
                tagMatches={tagMatches}
                addTag={(id) => { addTag(id); setTagPop(null); }}
                closeTagPop={() => setTagPop(null)}
              />
            </div>
          ))}

          {slash && (
            <div className="slash-menu" style={{ left: slash.x, top: slash.y }}>
              {SLASH.map((sec) => (
                <div key={sec.section}>
                  <div className="sm-section">{sec.section}</div>
                  {sec.items.filter(it => filteredSlash.includes(it)).map((it) => {
                    const flatIdx = filteredSlash.indexOf(it);
                    return (
                      <div key={it.key}
                           className={classNames('sm-item', flatIdx === slashSel && 'sel')}
                           onMouseEnter={() => setSlashSel(flatIdx)}
                           onMouseDown={(e) => {
                             e.preventDefault();
                             update((n) => { n.blocks[slash.blockIdx] = it.make(); });
                             setSlash(null);
                           }}>
                        <span className="icon">{it.glyph}</span>
                        <span className="label">{it.label}</span>
                        <span className="hint">{it.hint}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {filteredSlash.length === 0 && (
                <div className="sm-item"><span className="hint">no matches</span></div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockBody(props) {
  const { block: b, idx, note, tags, tagMap, today, onTextKey, setBlock, toggleAction, onWikilink, removeTag, onTagInput, tagPop, tagMatches, addTag, closeTagPop } = props;
  if (b.t === 'h1') {
    return (
      <h1
        contentEditable suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => setBlock(idx, (bb) => { bb.text = e.target.textContent; })}
        onKeyDown={(e) => onTextKey(e, idx)}
      >{b.text}</h1>
    );
  }
  if (b.t === 'h2') {
    return (
      <h2
        contentEditable suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => setBlock(idx, (bb) => { bb.text = e.target.textContent; })}
        onKeyDown={(e) => onTextKey(e, idx)}
      >{b.text}</h2>
    );
  }
  if (b.t === 'meta') {
    return <MetaStrip note={note} tagMap={tagMap} today={today} removeTag={removeTag} onTagInput={onTagInput} tagPop={tagPop} tagMatches={tagMatches} addTag={addTag} closeTagPop={closeTagPop} />;
  }
  if (b.t === 'callout') {
    return (
      <div className={`callout ${b.tone || ''}`}>
        <div style={{ flex: 1 }}>
          <div className="label">{b.tone === 'thesis' ? 'Thesis' : 'Note'}</div>
          <p contentEditable suppressContentEditableWarning spellCheck={false}
             onBlur={(e) => setBlock(idx, (bb) => { bb.text = e.target.textContent; })}
             onKeyDown={(e) => onTextKey(e, idx)}>{b.text}</p>
        </div>
      </div>
    );
  }
  if (b.t === 'p') {
    return (
      <p contentEditable suppressContentEditableWarning spellCheck={false}
         onBlur={(e) => setBlock(idx, (bb) => { bb.text = e.target.textContent; })}
         onKeyDown={(e) => onTextKey(e, idx)}>
        {renderInline(b.text, onWikilink)}
      </p>
    );
  }
  if (b.t === 'list') {
    return (
      <ul className="bul">
        {b.items.map((item, j) => (
          <li key={j}
              contentEditable suppressContentEditableWarning spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setBlock(idx, (bb) => { bb.items.splice(j + 1, 0, ''); });
                  setTimeout(() => {
                    const li = document.querySelectorAll(`[data-block-idx="${idx}"] li`)[j+1];
                    if (li) li.focus();
                  }, 0);
                }
                if (e.key === 'Backspace' && e.target.textContent === '' && b.items.length > 1) {
                  e.preventDefault();
                  setBlock(idx, (bb) => { bb.items.splice(j, 1); });
                }
              }}
              onBlur={(e) => setBlock(idx, (bb) => { bb.items[j] = e.target.textContent; })}>
            {item}
          </li>
        ))}
      </ul>
    );
  }
  if (b.t === 'action') {
    const dueClass = (() => {
      if (!b.due) return '';
      const d = new Date(b.due);
      const diff = Math.round((d - today) / 86400000);
      if (b.done) return '';
      if (diff < 0) return 'overdue';
      if (diff === 0) return 'today';
      return '';
    })();
    return (
      <div className={classNames('action', b.done && 'done')}>
        <span className="cb" onClick={() => toggleAction(idx)}></span>
        <span className="text"
              contentEditable suppressContentEditableWarning spellCheck={false}
              onBlur={(e) => setBlock(idx, (bb) => { bb.text = e.target.textContent; })}
              onKeyDown={(e) => onTextKey(e, idx)}>{b.text}</span>
        <span className="owner">{b.owner || '—'}</span>
        <span className={`due ${dueClass}`}>{b.due ? fmtDate(b.due, today) : '—'}</span>
      </div>
    );
  }
  if (b.t === 'table') {
    return <EditableTable block={b} setBlock={(mut) => setBlock(idx, mut)} />;
  }
  if (b.t === 'attendees') {
    return (
      <div className="attendees">
        {b.list.map((p, j) => (
          <span key={j} className="attendee">
            <Avatar name={p} />
            <span>{p}</span>
          </span>
        ))}
      </div>
    );
  }
  if (b.t === 'swot') {
    return (
      <div className="swot">
        {[['Strengths',['']],['Weaknesses',['']],['Opportunities',['']],['Threats',['']]].map(([h]) => (
          <div className="cell" key={h}>
            <h4>{h}</h4>
            <ul className="bul"><li contentEditable suppressContentEditableWarning>—</li></ul>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function MetaStrip({ note, tagMap, today, removeTag, onTagInput, tagPop, tagMatches, addTag, closeTagPop }) {
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (adding) inputRef.current && inputRef.current.focus(); }, [adding]);
  return (
    <div className="meta-strip">
      <span className="field"><span className="k">created</span><span className="v">{fmtISO(note.created)}</span></span>
      <span className="field"><span className="k">edited</span><span className="v">{fmtISO(note.updated)}</span></span>
      <span className="field"><span className="k">type</span><span className="v">{note.type}</span></span>
      <span className="field" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="k">tags</span>
        {note.tags.map(tid => tagMap[tid] && (
          <TagChip key={tid} tag={tagMap[tid]} onRemove={removeTag} />
        ))}
        {adding ? (
          <span style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              placeholder="tag…"
              style={{ width: 80, fontFamily: 'var(--font-mono)', fontSize: 11, borderBottom: '1px dashed var(--line-2)' }}
              onChange={(e) => onTagInput(e.target.value)}
              onBlur={() => setTimeout(() => { setAdding(false); closeTagPop(); }, 120)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); closeTagPop(); } }}
            />
            {tagPop && tagMatches.length > 0 && (
              <div className="tag-pop" style={{ top: 22, left: -4 }}>
                {tagMatches.map(t => (
                  <div key={t.id} className="ti" onMouseDown={(e) => { e.preventDefault(); addTag(t.id); setAdding(false); }}>
                    <span className="swatch" style={{ background: tagSwatch(t) }}></span>
                    {t.label}
                  </div>
                ))}
              </div>
            )}
          </span>
        ) : (
          <span className="tag-chip add" onClick={() => setAdding(true)}>add</span>
        )}
      </span>
      {note.backlinks && note.backlinks.length > 0 && (
        <span className="field"><span className="k">backlinks</span><span className="v">{note.backlinks.length}</span></span>
      )}
    </div>
  );
}

function EditableTable({ block, setBlock }) {
  const rows = block.rows || [];
  const headers = block.headers || [];
  const numericCols = headers.map((_, c) => isNumericCol(rows, c));
  const sums = headers.map((_, c) => {
    if (!numericCols[c]) return null;
    if (block.sum && block.sum[c] === false) return null;
    let total = 0; let hadAny = false;
    for (const r of rows) {
      const v = parseNum(r[c]);
      if (!isNaN(v)) { total += v; hadAny = true; }
    }
    return hadAny ? total : null;
  });

  const setCell = (r, c, val) => setBlock((b) => { b.rows[r][c] = val; });
  const setHeader = (c, val) => setBlock((b) => { b.headers[c] = val; });

  return (
    <div className="tbl-wrap">
      <table className="fin">
        <thead>
          <tr>
            {headers.map((h, c) => (
              <th key={c} className={numericCols[c] ? 'num' : ''}
                  contentEditable suppressContentEditableWarning
                  onBlur={(e) => setHeader(c, e.target.textContent)}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((v, c) => {
                const isNum = numericCols[c];
                const num = parseNum(v);
                const sign = !isNaN(num) && /^[+-]/.test(String(v).trim()) ? (num >= 0 ? 'pos' : 'neg') : '';
                return (
                  <td key={c}
                      className={classNames(isNum && 'num', sign)}
                      contentEditable suppressContentEditableWarning
                      onBlur={(e) => setCell(r, c, e.target.textContent)}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {sums.some(s => s != null) && (
          <tfoot>
            <tr>
              {sums.map((s, c) => (
                <td key={c} className={numericCols[c] ? 'num' : ''}>
                  {c === 0 ? '∑ total' : (s == null ? '' : s.toFixed(s % 1 === 0 ? 0 : 1))}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

Object.assign(window, { NoteEditor, EditableTable });
