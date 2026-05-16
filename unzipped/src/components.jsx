// Shared atoms + helpers
const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

function classNames(...xs) { return xs.filter(Boolean).join(' '); }

function fmtDate(d, today) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0 && diff < 7) return `+${diff}d`;
  if (diff < 0 && diff > -7) return `${diff}d`;
  return date.toISOString().slice(5, 10);
}

function fmtISO(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

function relTime(d, today) {
  const date = (d instanceof Date) ? d : new Date(d);
  const diff = Math.round((today - date) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff/7)}w ago`;
  return date.toISOString().slice(5, 10);
}

const TYPE_LABEL = {
  quick: 'quick',
  meeting: 'meeting',
  project: 'project',
  analysis: 'analysis',
  reference: 'reference',
};

const TYPE_GLYPH = {
  quick: '~',
  meeting: '⌂',
  project: '◆',
  analysis: 'Σ',
  reference: '∮',
};

function TypeBadge({ type }) {
  return (
    <span className={`type-badge t-${type}`}>
      <span className="mono">{TYPE_GLYPH[type] || '·'}</span>
      {TYPE_LABEL[type] || type}
    </span>
  );
}

function TagChip({ tag, onRemove, onClick }) {
  if (!tag) return null;
  return (
    <span className="tag-chip" onClick={onClick}>
      {tag.label}
      {onRemove ? <span className="x" onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}>×</span> : null}
    </span>
  );
}

function Avatar({ name, size = 18 }) {
  const initials = (name || '').split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.5 }}>{initials}</span>
  );
}

// parse a cell that may have leading/trailing signs into a number
function parseNum(s) {
  if (s == null) return NaN;
  const cleaned = String(s).replace(/[,\s]/g, '');
  // skip purely-text cells
  if (!/^[-+]?\d*\.?\d+%?$/.test(cleaned)) return NaN;
  return parseFloat(cleaned);
}

function isNumericCol(rows, col) {
  let nums = 0, tot = 0;
  for (const r of rows) {
    tot++;
    if (!isNaN(parseNum(r[col]))) nums++;
  }
  return tot > 0 && nums / tot >= 0.6;
}

// emit either text or [[wikilink]] segments
function renderInline(text, onWikilink) {
  if (!text) return null;
  const parts = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0; let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className="wikilink" onClick={(e) => { e.stopPropagation(); onWikilink && onWikilink(m[1]); }}>
        {m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

Object.assign(window, {
  classNames, fmtDate, fmtISO, relTime,
  TYPE_LABEL, TYPE_GLYPH, TypeBadge, TagChip, Avatar,
  parseNum, isNumericCol, renderInline,
});
