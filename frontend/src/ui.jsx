import { useEffect, useRef } from 'react';

const severityTones = {
  ERROR: 'error', FATAL: 'error', WARN: 'warn', WARNING: 'warn', INFO: 'info', DEBUG: 'debug',
};
const providerLabels = new Map([['mock', 'Mock'], ['openai', 'OpenAI']]);

export function AnalysisProvider({ provider, showLabel = false }) {
  return (
    <span className="analysis-provider">
      {showLabel && 'Proveedor: '}{providerLabels.get(provider) ?? provider}
    </span>
  );
}

export function Severity({ level }) {
  const tone = severityTones[level.toUpperCase()] ?? 'neutral';
  return <span className={`severity severity--${tone}`}>{level}</span>;
}

export function Timestamp({ value }) {
  return <time dateTime={value}>{new Date(value).toISOString().slice(0, -1).replace('T', ' ')}</time>;
}

export function Notice({ children, title, tone, onRetry }) {
  return (
    <div className={`notice${tone ? ` notice--${tone}` : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
      {onRetry && <button type="button" className="button" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function Pagination({ page, onPage }) {
  const { offset, limit, hasMore, items } = page;
  const start = offset + 1;
  const end = offset + items.length;
  return (
    <nav className="pagination" aria-label="Paginación">
      <span>
        {items.length > 0 ? `Mostrando ${start}–${end}` : 'Sin resultados en esta página'}
      </span>
      <div className="pagination-actions">
        <button type="button" className="button" disabled={offset === 0} onClick={() => onPage(offset - limit)}>
          <span aria-hidden="true">‹</span> Anterior
        </button>
        <span className="page-number" aria-current="page" aria-label={`Página ${Math.floor(offset / limit) + 1}`}>
          {Math.floor(offset / limit) + 1}
        </span>
        <button type="button" className="button" disabled={!hasMore} onClick={() => onPage(offset + limit)}>
          Siguiente <span aria-hidden="true">›</span>
        </button>
      </div>
    </nav>
  );
}

export function LogDetail({ log, onDismiss, onTrace }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  function close() {
    dialogRef.current.close();
    onDismiss();
  }

  return (
    <dialog
      ref={dialogRef}
      className="log-detail"
      aria-labelledby="log-detail-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
    >
      <div className="detail-header">
        <h2 id="log-detail-title">Detalle del log</h2>
        <button type="button" className="button icon-button" aria-label="Cerrar detalle" onClick={close}>×</button>
      </div>
      <dl className="log-metadata">
        <dt>ID</dt><dd>{log.id}</dd>
        <dt>Fecha y hora (UTC)</dt><dd><Timestamp value={log.timestamp} /></dd>
        <dt>Nivel</dt><dd><Severity level={log.level} /></dd>
        <dt>Servicio</dt><dd>{log.service}</dd>
        <dt>ID de traza</dt><dd className="mono">{log.traceId ?? 'Sin traza'}</dd>
      </dl>
      <h3>Mensaje</h3>
      <pre className="log-message">{log.message}</pre>
      {log.traceId && (
        <button type="button" className="button primary" onClick={() => {
          close();
          onTrace(log.traceId);
        }}>Ver traza <span aria-hidden="true">↗</span></button>
      )}
    </dialog>
  );
}

export function FindingList({ findings, categories, onDetail }) {
  return (
    <ul className="finding-list">
      {findings.map((finding) => (
        <li key={finding.id} className="finding">
          <span className="category" title={categories.get(finding.category)}>{finding.category}</span>
          <h3>{finding.description}</h3>
          {categories.has(finding.category) && <p className="muted">{categories.get(finding.category)}</p>}
          <p><strong>Sugerencia</strong><br />{finding.suggestion}</p>
          <details className="evidence">
            <summary>Ver evidencia ({finding.evidence.length})</summary>
            <ul>
              {finding.evidence.map((log) => (
                <li key={log.id}>
                  <button type="button" className="evidence-log" onClick={() => onDetail(log)}>
                    <span className="evidence-meta">
                      <Timestamp value={log.timestamp} /> <Severity level={log.level} /> <span>{log.service}</span>
                    </span>
                    <span className="mono">{log.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
