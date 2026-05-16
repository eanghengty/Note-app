// Main App — state, routing, command palette, tweaks integration

function App() {
  const SEED = window.SEED;
  const [notes, setNotes] = useState(() => SEED.notes.map(n => ({ ...n, updated: new Date(n.updated), created: new Date(n.created) })));
  const [view, setView] = useState('dashboard'); // dashboard | editor | search | templates
  const [scope, setScope] = useState(null); // null | 'pinned' | 'type:xxx'
  const [activeNoteId, setActiveNoteId] = useState('n-001');
  const [activeTag, setActiveTag] = useState(null);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [cmdOpen, setCmdOpen] = useState(false);

  // tweaks
  const [t, setTweak] = window.useTweaks(/*EDITMODE-BEGIN*/{
    "theme": "light",
    "density": "comfy",
    "fontPair": "sans",
    "layout": "3pane",
    "editorWidth": "default"
  }/*EDITMODE-END*/);

  useEffect(() => {
    document.body.dataset.theme = t.theme;
    document.body.dataset.density = t.density;
    document.body.dataset.fontpair = t.fontPair;
    document.body.dataset.editorW = t.editorWidth;
  }, [t.theme, t.density, t.fontPair, t.editorWidth]);

  const today = SEED.today;
  const tags = SEED.tags;

  const counts = useMemo(() => {
    const c = {
      dashboard: null,
      all: notes.length,
      search: null,
      today: notes.flatMap(n => n.blocks.filter(b => b.t === 'action' && !b.done)).length,
      templates: SEED.templates.length,
    };
    for (const ty of ['quick','meeting','project','analysis','reference']) {
      c['type:' + ty] = notes.filter(n => n.type === ty).length;
    }
    for (const tg of tags) {
      c['tag:' + tg.id] = notes.filter(n => n.tags.includes(tg.id)).length;
    }
    return c;
  }, [notes, tags]);

  const activeNote = notes.find(n => n.id === activeNoteId) || notes[0];

  const onNav = (id, tagId) => {
    if (id === 'dashboard' || id === 'search' || id === 'templates') { setView(id); setScope(null); setActiveTag(null); return; }
    if (id === 'all') { setView('editor'); setScope(null); }
    else if (id === 'today') { setView('editor'); setScope('pinned'); /* surrogate: show all and filter actions later */ }
    else if (id.startsWith('type:')) { setView('editor'); setScope(id); }
    if (tagId) setActiveTag(tagId);
  };
  const onTagClick = (tagId) => { setView('editor'); setActiveTag(activeTag === tagId ? null : tagId); setScope(null); };

  const onSelectNote = (id) => { setActiveNoteId(id); setView('editor'); };
  const onOpenNote = (id) => { setActiveNoteId(id); setView('editor'); };
  const onNoteChange = (next) => setNotes(ns => ns.map(n => n.id === next.id ? next : n));
  const onPinToggle = (id) => setNotes(ns => ns.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  const onExport = (id, fmt) => { /* fake */ console.log('export', id, fmt); };

  const onQuickCapture = (type, title) => {
    const id = 'n-' + Date.now();
    const newN = {
      id, title, type, tags: [], pinned: false,
      created: today, updated: today,
      blocks: [{ t: 'h1', text: title }, { t: 'p', text: '' }],
    };
    setNotes(ns => [newN, ...ns]);
    setActiveNoteId(id);
    setView('editor');
  };

  const onUseTemplate = (tpl) => {
    const id = 'n-' + Date.now();
    const newN = {
      id, title: tpl.name + ' — new', type: tpl.type, tags: [], pinned: false,
      created: today, updated: today,
      blocks: JSON.parse(JSON.stringify(tpl.blocks)),
    };
    setNotes(ns => [newN, ...ns]);
    setActiveNoteId(id);
    setView('editor');
  };

  // command palette: ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); setCmdOpen(c => !c);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const layoutClass = t.layout === '2pane' ? 'layout-2pane' : t.layout === 'zen' ? 'layout-zen' : '';

  return (
    <div className="app" data-screen-label="ledger-app">
      <div className="topframe">
        <div className="brand"><span className="brand-mark"></span><span>LEDGER</span></div>
        <span className="sep"></span>
        <div className="crumbs">
          <span>holloway-cap</span><span className="arrow">›</span>
          <span>{view === 'editor' && activeNote ? activeNote.title : view}</span>
        </div>
        <div className="right">
          <button className="qcap" onClick={() => setCmdOpen(true)}>
            <span className="mono">⌕</span>
            <span>Quick capture or jump…</span>
            <span className="kbd">⌘K</span>
          </button>
          <span>Lena Park</span>
        </div>
      </div>

      <div className={classNames('workspace', layoutClass, view !== 'editor' && 'no-list')}>
        <Sidebar
          counts={counts}
          tags={tags}
          current={
            view === 'dashboard' ? 'dashboard' :
            view === 'search'    ? 'search'    :
            view === 'templates' ? 'templates' :
            scope && scope.startsWith('type:') ? scope :
            scope === 'pinned' ? 'today' :
            activeTag ? '' : 'all'
          }
          onNav={onNav}
          onTagClick={onTagClick}
          activeTag={activeTag}
        />

        {view === 'editor' && (
          <ListPane
            notes={notes}
            tags={tags}
            today={today}
            activeId={activeNoteId}
            onSelect={onSelectNote}
            query={query}
            setQuery={setQuery}
            filterType={filterType}
            setFilterType={setFilterType}
            activeTag={activeTag}
            clearTag={() => setActiveTag(null)}
            scope={scope}
          />
        )}

        {view === 'editor' && activeNote && (
          <NoteEditor
            note={activeNote}
            tags={tags}
            today={today}
            dataAll={{ notes }}
            onNoteChange={onNoteChange}
            onOpenNote={onOpenNote}
            onPinToggle={onPinToggle}
            onExport={onExport}
          />
        )}

        {view === 'dashboard' && (
          <div className="editor-pane" style={{ overflow: 'auto' }}>
            <Dashboard
              notes={notes}
              tags={tags}
              today={today}
              onOpenNote={onOpenNote}
              onNav={onNav}
              onToggleAction={() => {}}
              onQuickCapture={onQuickCapture}
            />
          </div>
        )}

        {view === 'search' && (
          <div className="editor-pane" style={{ overflow: 'auto' }}>
            <SearchScreen
              notes={notes}
              tags={tags}
              today={today}
              onOpenNote={onOpenNote}
            />
          </div>
        )}

        {view === 'templates' && (
          <div className="editor-pane" style={{ overflow: 'auto' }}>
            <TemplateGallery
              templates={SEED.templates}
              onUse={onUseTemplate}
            />
          </div>
        )}
      </div>

      <div className="statusbar">
        <span><span className="dot"></span> connected · sync 12s ago</span>
        <span>{notes.length} notes</span>
        <span>{tags.length} tags</span>
        <span>{counts.today} open actions</span>
        <span className="right">
          <span>v 1.4.2 · ledger</span>
          <span>UTC−05:00</span>
          <span>{today.toString().slice(0, 15)}</span>
        </span>
      </div>

      {cmdOpen && (
        <CommandPalette
          notes={notes}
          tags={tags}
          today={today}
          onClose={() => setCmdOpen(false)}
          onOpenNote={(id) => { onOpenNote(id); setCmdOpen(false); }}
          onNav={(v) => { setView(v); setScope(null); setCmdOpen(false); }}
          onQuickCapture={(type, title) => { onQuickCapture(type, title); setCmdOpen(false); }}
        />
      )}

      <TweaksUI t={t} setTweak={setTweak} />
    </div>
  );
}

function CommandPalette({ notes, tags, today, onClose, onOpenNote, onNav, onQuickCapture }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  const tagMap = makeTagMap(tags);
  const isNew = q.startsWith('+ ') || q.startsWith('> ');
  const newTitle = q.replace(/^[+>]\s*/, '');

  const actions = [
    { kind: 'nav', label: 'Go to Dashboard',     hint: 'G D', run: () => onNav('dashboard'), glyph: '◷' },
    { kind: 'nav', label: 'Go to All notes',     hint: 'G A', run: () => { onNav('editor'); }, glyph: '∀' },
    { kind: 'nav', label: 'Go to Search',        hint: 'G S', run: () => onNav('search'), glyph: '⌕' },
    { kind: 'nav', label: 'Go to Templates',     hint: 'G T', run: () => onNav('templates'), glyph: '⊞' },
    { kind: 'new', label: 'New quick note',      hint: '↵',   run: () => onQuickCapture('quick', newTitle || 'Untitled'), glyph: '~' },
    { kind: 'new', label: 'New meeting note',    hint: '',    run: () => onQuickCapture('meeting', newTitle || 'Untitled meeting'), glyph: '⌂' },
    { kind: 'new', label: 'New project note',    hint: '',    run: () => onQuickCapture('project', newTitle || 'Untitled project'), glyph: '◆' },
    { kind: 'new', label: 'New analysis note',   hint: '',    run: () => onQuickCapture('analysis', newTitle || 'Untitled analysis'), glyph: 'Σ' },
  ];

  const noteMatches = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return notes.slice(0, 8);
    return notes.filter(n => n.title.toLowerCase().includes(qq) || n.tags.some(t => tagMap[t]?.label.includes(qq))).slice(0, 8);
  }, [notes, q]);

  const actionMatches = useMemo(() => {
    const qq = q.trim().toLowerCase().replace(/^[+>]\s*/, '');
    return actions.filter(a => a.label.toLowerCase().includes(qq));
  }, [q]);

  const flat = [
    ...(isNew ? actionMatches.filter(a => a.kind === 'new') : noteMatches.map(n => ({ kind: 'note', label: n.title, hint: TYPE_LABEL[n.type], glyph: TYPE_GLYPH[n.type], n, run: () => onOpenNote(n.id) }))),
    ...(!isNew ? actionMatches : []),
  ];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(flat.length - 1, s + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      if (e.key === 'Enter') { e.preventDefault(); flat[sel] && flat[sel].run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, sel]);

  const noteSec = flat.filter(x => x.kind === 'note');
  const navSec = flat.filter(x => x.kind === 'nav');
  const newSec = flat.filter(x => x.kind === 'new');

  return (
    <div className="cmd-shade" onClick={onClose}>
      <div className="cmd" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input">
          <span className="lead mono">⌕</span>
          <input ref={inputRef}
                 value={q}
                 onChange={(e) => { setQ(e.target.value); setSel(0); }}
                 placeholder="Jump to a note, run a command, or type '+ new note title'" />
          <span className="esc">esc</span>
        </div>
        <div className="cmd-list">
          {noteSec.length > 0 && <div className="cmd-section">notes</div>}
          {noteSec.map((it, i) => {
            const globalIdx = flat.indexOf(it);
            return (
              <div key={'n'+i} className={classNames('cmd-item', globalIdx === sel && 'sel')}
                   onMouseEnter={() => setSel(globalIdx)}
                   onMouseDown={(e) => { e.preventDefault(); it.run(); }}>
                <span className="g">{it.glyph}</span>
                <span className="lbl">{it.label}</span>
                <span className="hint">{it.hint}</span>
              </div>
            );
          })}
          {newSec.length > 0 && <div className="cmd-section">{isNew ? 'create' : 'new'}</div>}
          {newSec.map((it, i) => {
            const globalIdx = flat.indexOf(it);
            return (
              <div key={'c'+i} className={classNames('cmd-item', globalIdx === sel && 'sel')}
                   onMouseEnter={() => setSel(globalIdx)}
                   onMouseDown={(e) => { e.preventDefault(); it.run(); }}>
                <span className="g">{it.glyph}</span>
                <span className="lbl">{it.label}{isNew && newTitle ? `: "${newTitle}"` : ''}</span>
                <span className="hint">{it.hint}</span>
              </div>
            );
          })}
          {navSec.length > 0 && <div className="cmd-section">navigate</div>}
          {navSec.map((it, i) => {
            const globalIdx = flat.indexOf(it);
            return (
              <div key={'g'+i} className={classNames('cmd-item', globalIdx === sel && 'sel')}
                   onMouseEnter={() => setSel(globalIdx)}
                   onMouseDown={(e) => { e.preventDefault(); it.run(); }}>
                <span className="g">{it.glyph}</span>
                <span className="lbl">{it.label}</span>
                <span className="hint">{it.hint}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TweaksUI({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Appearance">
        <TweakRadio label="Theme" value={t.theme} onChange={(v) => setTweak('theme', v)} options={[
          { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
        ]} />
        <TweakRadio label="Density" value={t.density} onChange={(v) => setTweak('density', v)} options={[
          { value: 'comfy', label: 'Comfy' }, { value: 'compact', label: 'Compact' },
        ]} />
      </TweakSection>
      <TweakSection label="Typography">
        <TweakSelect label="Font pairing" value={t.fontPair} onChange={(v) => setTweak('fontPair', v)} options={[
          { value: 'sans',      label: 'Inter Tight + JetBrains Mono' },
          { value: 'editorial', label: 'Newsreader serif + JetBrains' },
          { value: 'plex',      label: 'IBM Plex Sans + Plex Mono' },
          { value: 'mono',      label: 'All-mono (terminal)' },
        ]} />
      </TweakSection>
      <TweakSection label="Layout">
        <TweakSelect label="Sidebar layout" value={t.layout} onChange={(v) => setTweak('layout', v)} options={[
          { value: '3pane', label: '3 panes — nav · list · editor' },
          { value: '2pane', label: '2 panes — nav · editor' },
          { value: 'zen',   label: 'Zen — editor only' },
        ]} />
        <TweakRadio label="Editor width" value={t.editorWidth} onChange={(v) => setTweak('editorWidth', v)} options={[
          { value: 'narrow', label: 'Narrow' },
          { value: 'default', label: 'Default' },
          { value: 'wide', label: 'Wide' },
        ]} />
      </TweakSection>
    </TweaksPanel>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
