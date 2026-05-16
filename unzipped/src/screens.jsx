// Dashboard, List/Search, Template gallery, Sidebar

function Sidebar({ counts, tags, current, onNav, onTagClick, activeTag, layout }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', glyph: '◷' },
    { id: 'all',       label: 'All notes', glyph: '∀' },
    { id: 'search',    label: 'Search',    glyph: '⌕' },
    { id: 'today',     label: "Today's actions", glyph: '☐' },
    { id: 'templates', label: 'Templates', glyph: '⊞' },
  ];
  const types = [
    { id: 'quick',     label: 'Quick'     },
    { id: 'meeting',   label: 'Meeting'   },
    { id: 'project',   label: 'Project'   },
    { id: 'analysis',  label: 'Analysis'  },
    { id: 'reference', label: 'Reference' },
  ];
  return (
    <aside className="sidebar">
      <div className="scroll">
        <div className="section-label">workspace<span className="count">holloway-cap</span></div>
        {items.map(it => (
          <div key={it.id}
               className={classNames('nav-item', current === it.id && 'active')}
               onClick={() => onNav(it.id)}>
            <span className="glyph">{it.glyph}</span>
            <span>{it.label}</span>
            {counts[it.id] != null && <span className="count">{counts[it.id]}</span>}
          </div>
        ))}

        <div className="section-label">type</div>
        {types.map(t => (
          <div key={t.id}
               className={classNames('nav-item', current === `type:${t.id}` && 'active')}
               onClick={() => onNav(`type:${t.id}`)}>
            <span className="glyph mono">{TYPE_GLYPH[t.id]}</span>
            <span>{t.label}</span>
            <span className="count">{counts[`type:${t.id}`] || 0}</span>
          </div>
        ))}

        <div className="section-label">tags <span className="count">{tags.length}</span></div>
        {tags.map(t => (
          <div key={t.id}
               className={classNames('tag-row', activeTag === t.id && 'active')}
               onClick={() => onTagClick(t.id)}
               style={activeTag === t.id ? { color: 'var(--ink)', background: 'var(--bg-elev)' } : null}>
            <span className="swatch" style={{ background: tagSwatch(t) }}></span>
            <span>#{t.label}</span>
            <span className="count">{counts['tag:' + t.id] || 0}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ------- List pane ------- */
function ListPane({ notes, tags, today, activeId, onSelect, query, setQuery, filterType, setFilterType, activeTag, clearTag, scope }) {
  const tagMap = makeTagMap(tags);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter(n => {
      if (filterType && n.type !== filterType) return false;
      if (activeTag && !n.tags.includes(activeTag)) return false;
      if (scope === 'pinned' && !n.pinned) return false;
      if (scope && scope.startsWith('type:') && n.type !== scope.slice(5)) return false;
      if (q) {
        const hay = (n.title + ' ' + n.blocks.map(b => b.text || (b.items||[]).join(' ') || '').join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.updated - a.updated);
  }, [notes, query, filterType, activeTag, scope]);

  const TYPE_CHIPS = ['quick', 'meeting', 'project', 'analysis', 'reference'];

  const headerLabel =
    scope === 'pinned' ? 'Pinned' :
    scope && scope.startsWith('type:') ? `${scope.slice(5)} notes` :
    activeTag ? `#${tagMap[activeTag]?.label}` :
    'All notes';

  return (
    <div className="list-pane">
      <div className="list-head">
        <div className="h">
          <h2>{headerLabel}</h2>
          <span className="count mono">{filtered.length}</span>
        </div>
        <div className="searchbox">
          <span className="mono">⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search title, body, tag…" />
        </div>
        <div className="filter-strip">
          {TYPE_CHIPS.map(t => (
            <span key={t}
                  className={classNames('chip', filterType === t && 'on')}
                  onClick={() => setFilterType(filterType === t ? null : t)}>
              {TYPE_GLYPH[t]} {t}
            </span>
          ))}
          {activeTag && (
            <span className="chip tag on" onClick={clearTag}>{tagMap[activeTag]?.label} ×</span>
          )}
        </div>
      </div>
      <div className="list-scroll">
        {filtered.map(n => {
          const preview = (n.blocks.find(b => b.t === 'p' || b.t === 'callout')?.text)
            || (n.blocks.find(b => b.t === 'list')?.items?.join(' · '))
            || '';
          return (
            <div key={n.id}
                 className={classNames('list-item', activeId === n.id && 'active')}
                 onClick={() => onSelect(n.id)}>
              <div className="title">
                {n.pinned && <span className="pin">★</span>}
                <span style={{ flex: 1 }}>{n.title}</span>
              </div>
              <div className="preview">{preview}</div>
              <div className="meta">
                <TypeBadge type={n.type} />
                <span>{fmtISO(n.updated)}</span>
                {n.tags.slice(0, 3).map(tid => tagMap[tid] && (
                  <span key={tid} className="mono" style={{ color: 'var(--ink-3)' }}>#{tagMap[tid].label}</span>
                ))}
                {n.tags.length > 3 && <span>+{n.tags.length - 3}</span>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 24, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>no notes match.</div>
        )}
      </div>
    </div>
  );
}

/* ------- Dashboard ------- */
function Dashboard({ notes, tags, today, onOpenNote, onNav, onToggleAction, onQuickCapture }) {
  const tagMap = makeTagMap(tags);
  const recent = [...notes].sort((a,b) => b.updated - a.updated).slice(0, 6);
  const pinned = notes.filter(n => n.pinned).slice(0, 4);

  // gather all action items, with parent note
  const actions = [];
  for (const n of notes) {
    n.blocks.forEach((b, idx) => {
      if (b.t === 'action') actions.push({ ...b, noteId: n.id, noteTitle: n.title, blockIdx: idx });
    });
  }
  const todayMs = today.getTime();
  const overdue = actions.filter(a => !a.done && a.due && new Date(a.due).getTime() < todayMs);
  const dueToday = actions.filter(a => !a.done && a.due && fmtISO(a.due) === fmtISO(today));
  const dueSoon = actions.filter(a => !a.done && a.due && new Date(a.due).getTime() > todayMs).sort((a,b) => new Date(a.due) - new Date(b.due)).slice(0, 4);

  // activity bars — notes per day, last 14 days
  const activity = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const day = fmtISO(d);
    const ct = notes.filter(n => fmtISO(n.updated) === day || fmtISO(n.created) === day).length;
    activity.push(ct);
  }
  const max = Math.max(1, ...activity);

  // tag frequency (top)
  const tagCounts = {};
  for (const n of notes) for (const t of n.tags) tagCounts[t] = (tagCounts[t]||0)+1;
  const topTags = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).slice(0, 8)
    .map(([id, c]) => ({ tag: tagMap[id], count: c })).filter(x => x.tag);

  // group today's actions by owner
  const byOwner = {};
  [...overdue, ...dueToday, ...dueSoon].forEach(a => {
    const k = a.owner || '—';
    (byOwner[k] = byOwner[k] || []).push(a);
  });

  const [qval, setQval] = useState('');
  const [qtype, setQtype] = useState('quick');

  const tagBreakdown = topTags.map(({tag, count}) => ({
    tag, count, frac: count / notes.length
  }));

  // numbers across notes — pull sums from tables
  const tableHotlist = [];
  for (const n of notes) {
    for (const b of n.blocks) {
      if (b.t === 'table' && b.rows && b.rows.length >= 2) {
        // find a numeric column with a strong total
        for (let c = 0; c < (b.headers || []).length; c++) {
          if (!isNumericCol(b.rows, c)) continue;
          let s = 0, any = false;
          for (const r of b.rows) { const v = parseNum(r[c]); if (!isNaN(v)) { s += v; any = true; } }
          if (any && Math.abs(s) > 100) {
            tableHotlist.push({ note: n, header: b.headers[c], total: s, rows: b.rows.length });
            break;
          }
        }
      }
    }
  }

  return (
    <div className="dash">
      <h1>Good morning, Lena.</h1>
      <div className="sub">{today.toString().slice(0, 15)} · {actions.filter(a => !a.done).length} open actions · {notes.length} notes</div>

      <div className="qcap-bar">
        <span className="lead">{TYPE_GLYPH[qtype]} new</span>
        <input
          value={qval}
          onChange={(e) => setQval(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && qval.trim()) { onQuickCapture(qtype, qval.trim()); setQval(''); } }}
          placeholder="Quick capture — type a thought, press ↵"
        />
        <div className="types">
          {['quick','meeting','project','analysis','reference'].map(t => (
            <span key={t} className={classNames('chip', qtype === t && 'on')} onClick={() => setQtype(t)}>{t}</span>
          ))}
        </div>
        <span className="kbd">⌘ K</span>
      </div>

      <div className="dash-grid">
        <div>
          <div className="card">
            <div className="card-h">
              <h3>Today · action items</h3>
              <span className="meta">{overdue.length} overdue · {dueToday.length} today · {dueSoon.length} upcoming</span>
            </div>
            <div className="today-strip">
              {Object.entries(byOwner).map(([owner, list]) => (
                <div key={owner} className="lane">
                  <div className="who"><Avatar name={owner} size={16} /><span>{owner}</span></div>
                  <div className="track">
                    {list.map((a, i) => {
                      const ms = new Date(a.due).getTime();
                      const cls = a.done ? 'done' : (ms < todayMs ? 'overdue' : (fmtISO(a.due) === fmtISO(today) ? '' : ''));
                      return (
                        <span key={i} className={classNames('pill', cls)}
                              onClick={() => onOpenNote(a.noteId)}>
                          <span className="cb"></span>
                          <span>{a.text}</span>
                          <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 10 }}>· {fmtDate(a.due, today)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(byOwner).length === 0 && (
                <div className="lane"><div className="who">—</div><div className="track"><span style={{ color: 'var(--ink-4)', fontSize: 12 }}>No actions surfacing right now.</span></div></div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-h">
              <h3>Recent</h3>
              <span className="meta">last 6</span>
            </div>
            {recent.map(n => (
              <div key={n.id} className="row" onClick={() => onOpenNote(n.id)}>
                <TypeBadge type={n.type} />
                <span className="title">{n.title}</span>
                <span className="micro">{n.tags.slice(0,2).map(t => '#' + tagMap[t]?.label).join(' ')}</span>
                <span className="ts">{relTime(n.updated, today)}</span>
              </div>
            ))}
          </div>

          {tableHotlist.length > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-h">
                <h3>Numbers in play</h3>
                <span className="meta">auto-summed tables across notes</span>
              </div>
              {tableHotlist.slice(0, 5).map((x, i) => (
                <div key={i} className="row" onClick={() => onOpenNote(x.note.id)}>
                  <span className="micro" style={{ width: 110 }}>{x.header}</span>
                  <span className="mono tnum" style={{ fontWeight: 600, width: 70, textAlign: 'right' }}>{x.total.toFixed(x.total % 1 === 0 ? 0 : 1)}</span>
                  <span className="title">{x.note.title}</span>
                  <span className="micro">{x.rows} rows</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h3>Pinned</h3>
              <span className="meta">{pinned.length}</span>
            </div>
            {pinned.map(n => (
              <div key={n.id} className="row" onClick={() => onOpenNote(n.id)}>
                <span className="mono" style={{ color: 'var(--warn)' }}>★</span>
                <span className="title">{n.title}</span>
                <span className="ts">{relTime(n.updated, today)}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-h">
              <h3>Activity</h3>
              <span className="meta">last 14 days</span>
            </div>
            <div className="activity" style={{ height: 44 }}>
              {activity.map((v, i) => (
                <span key={i} className={classNames('b', v >= max*0.66 ? 'hot' : v >= max*0.33 ? 'warm' : '')}
                      style={{ height: `${Math.max(2, (v / max) * 100)}%`, flex: 1 }}></span>
              ))}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span>−14d</span><span>today</span>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-h">
              <h3>Top tags</h3>
              <span className="meta">{tags.length} total</span>
            </div>
            {tagBreakdown.map(({tag, count, frac}) => (
              <div key={tag.id} className="row" style={{ borderBottom: '1px solid var(--hairline)', padding: '6px 0' }}
                   onClick={() => onNav('all', tag.id)}>
                <span className="swatch" style={{ width: 8, height: 8, borderRadius: 2, background: tagSwatch(tag) }}></span>
                <span className="title mono" style={{ fontSize: 12 }}>#{tag.label}</span>
                <span style={{ flex: 1, height: 4, background: 'var(--hairline)', borderRadius: 2, overflow: 'hidden', maxWidth: 80 }}>
                  <span style={{ display: 'block', height: '100%', width: `${frac * 100}%`, background: 'var(--ink-3)' }}></span>
                </span>
                <span className="ts">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------- Search screen ------- */
function SearchScreen({ notes, tags, today, onOpenNote }) {
  const [q, setQ] = useState('');
  const [activeFilters, setActiveFilters] = useState({ types: [], tags: [] });
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  const tagMap = makeTagMap(tags);

  const results = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return notes.map(n => {
      let score = 0;
      let snippet = '';
      if (qq) {
        if (n.title.toLowerCase().includes(qq)) score += 5;
        for (const b of n.blocks) {
          const txt = b.text || (b.items || []).join(' · ') || '';
          if (txt.toLowerCase().includes(qq)) {
            score += 1;
            if (!snippet) {
              const idx = txt.toLowerCase().indexOf(qq);
              const start = Math.max(0, idx - 30);
              snippet = (start > 0 ? '…' : '') + txt.slice(start, idx + qq.length + 60);
            }
          }
        }
      } else {
        score = 1;
        snippet = (n.blocks.find(b => b.t === 'callout' || b.t === 'p')?.text || '').slice(0, 100);
      }
      if (activeFilters.types.length && !activeFilters.types.includes(n.type)) score = 0;
      if (activeFilters.tags.length && !activeFilters.tags.every(t => n.tags.includes(t))) score = 0;
      return { n, score, snippet };
    }).filter(r => r.score > 0).sort((a,b) => b.score - a.score || b.n.updated - a.n.updated);
  }, [notes, q, activeFilters]);

  const highlight = (s, query) => {
    if (!query) return s;
    const idx = s.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return s;
    return (
      <Fragment>
        {s.slice(0, idx)}
        <b>{s.slice(idx, idx + query.length)}</b>
        {s.slice(idx + query.length)}
      </Fragment>
    );
  };

  const toggleType = (t) => setActiveFilters(f => ({ ...f, types: f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t] }));
  const toggleTag = (t) => setActiveFilters(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }));

  return (
    <div className="search-screen">
      <div className="big-search">
        <span className="mono" style={{ color: 'var(--ink-3)' }}>⌕</span>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="search across all notes — title, body, tags, attendees…" />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{results.length} match{results.length === 1 ? '' : 'es'}</span>
      </div>
      <div className="filters">
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', alignSelf: 'center', marginRight: 4 }}>TYPE</span>
        {['quick','meeting','project','analysis','reference'].map(t => (
          <span key={t} className={classNames('chip', activeFilters.types.includes(t) && 'on')} onClick={() => toggleType(t)}>{TYPE_GLYPH[t]} {t}</span>
        ))}
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', alignSelf: 'center', marginRight: 4, marginLeft: 8 }}>TAGS</span>
        {tags.slice(0, 8).map(t => (
          <span key={t.id} className={classNames('chip tag', activeFilters.tags.includes(t.id) && 'on')} onClick={() => toggleTag(t.id)}>{t.label}</span>
        ))}
      </div>
      <div className="search-results">
        {results.slice(0, 40).map(({n, snippet}) => (
          <div key={n.id} className="res" onClick={() => onOpenNote(n.id)}>
            <TypeBadge type={n.type} />
            <div>
              <div className="title">{highlight(n.title, q)}</div>
              <div className="snippet">{highlight(snippet || '', q)}</div>
            </div>
            <div className="mt">
              {n.tags.slice(0, 2).map(tid => tagMap[tid] && <div key={tid}>#{tagMap[tid].label}</div>)}
            </div>
            <div className="mt">{fmtISO(n.updated)}<br/>{relTime(n.updated, today)}</div>
          </div>
        ))}
        {results.length === 0 && (
          <div style={{ padding: 32, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>
            no matches. try fewer filters.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------- Templates ------- */
function TemplateGallery({ templates, onUse }) {
  const [filter, setFilter] = useState(null);
  const shown = filter ? templates.filter(t => t.type === filter) : templates;
  return (
    <div className="tpl-screen">
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.015em' }}>Templates</h1>
      <div className="sub mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>Start a structured note. {templates.length} templates available.</div>
      <div className="filters" style={{ marginTop: 18 }}>
        <span className={classNames('chip', !filter && 'on')} onClick={() => setFilter(null)}>all</span>
        {['quick','meeting','project','analysis','reference'].map(t => (
          <span key={t} className={classNames('chip', filter === t && 'on')} onClick={() => setFilter(t)}>{TYPE_GLYPH[t]} {t}</span>
        ))}
      </div>
      <div className="tpl-grid">
        {shown.map(t => (
          <div key={t.id} className="tpl-card" onClick={() => onUse(t)}>
            <div className="preview">
              <TemplatePreview blocks={t.blocks} />
            </div>
            <h4>{t.name}</h4>
            <div className="desc">{t.desc}</div>
            <div className="footer">
              <span><TypeBadge type={t.type} /></span>
              <span>used {t.usage}×</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatePreview({ blocks }) {
  return (
    <div>
      {blocks.slice(0, 8).map((b, i) => {
        if (b.t === 'h1') return <div key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>{b.text || 'Title'}</div>;
        if (b.t === 'h2') return <div key={i} style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-2)', marginTop: 6 }}>§ {b.text}</div>;
        if (b.t === 'meta') return <div key={i} style={{ borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', padding: '2px 0', margin: '3px 0' }}>created · type · tags</div>;
        if (b.t === 'callout') return <div key={i} style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 4, marginTop: 3, color: 'var(--ink-2)' }}>{b.text || 'thesis…'}</div>;
        if (b.t === 'p') return <div key={i} style={{ marginTop: 3 }}>━━ ━━━━ ━━━━━━━━ ━━━━━━</div>;
        if (b.t === 'list') return <div key={i}>{b.items.map((_, j) => <div key={j}>— ━━━━━━━━━</div>)}</div>;
        if (b.t === 'action') return <div key={i}>☐ ━━━━━━━━ &nbsp; @LP &nbsp; +2d</div>;
        if (b.t === 'attendees') return <div key={i}>@ ━━━ ━━━ ━━━</div>;
        if (b.t === 'table') return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${b.headers.length},1fr)`, gap: 1, background: 'var(--line)', margin: '3px 0' }}>
            {b.headers.map((h, c) => <div key={c} style={{ background: 'var(--bg-elev)', padding: 1, fontSize: 7 }}>{h || '━━'}</div>)}
            {b.rows.flatMap((row, r) => row.map((v, c) => <div key={`${r}-${c}`} style={{ background: 'var(--panel)', padding: 1, fontSize: 7 }}>{v || '·'}</div>))}
          </div>
        );
        if (b.t === 'swot') return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', margin: '3px 0' }}>
            {['S','W','O','T'].map(x => <div key={x} style={{ background: 'var(--panel)', padding: '4px 5px' }}>{x}</div>)}
          </div>
        );
        return null;
      })}
    </div>
  );
}

Object.assign(window, { Sidebar, ListPane, Dashboard, SearchScreen, TemplateGallery });
