import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsOptions, summaryOptions } from './api.js';
import FilterForm from './FilterForm.jsx';
import { Notice, Pagination, Severity, Timestamp } from './ui.jsx';

const logFields = ['service', 'level', 'from', 'to', 'traceId'];
const countFormat = new Intl.NumberFormat('es');

function Summary({ query }) {
  const byService = Map.groupBy(query.data?.items ?? [], ({ service }) => service);
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <h2 id="summary-title">Resumen por servicio y nivel</h2>
      {query.isPending ? <Notice>Cargando resumen…</Notice> :
        query.isError ? <Notice tone="error" title="No se pudo cargar el resumen." onRetry={query.refetch}>{query.error.message}</Notice> :
          byService.size === 0 ? <Notice>No hay coincidencias para los filtros aplicados.</Notice> : (
            <ul className="service-summary">
              {Array.from(byService, ([service, levels]) => (
                <li key={service}>
                  <h3>{service}</h3>
                  <ul className="level-counts">
                    {levels.map(({ level, count }) => (
                      <li key={level}><Severity level={level} /> <span>{countFormat.format(count)}</span></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}

function LogTable({ logs, selected, onSelect, onDetail, onTrace }) {
  const allSelected = logs.every(({ id }) => selected.has(id));
  const someSelected = logs.some(({ id }) => selected.has(id));
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla de logs">
      <table className="logs-table">
        <thead>
          <tr>
            <th scope="col">
              <input type="checkbox" aria-label="Seleccionar esta página" checked={allSelected}
                ref={(input) => { if (input) input.indeterminate = someSelected && !allSelected; }}
                onChange={(event) => onSelect(logs.map(({ id }) => id), event.target.checked)} />
            </th>
            <th scope="col" aria-sort="descending">Fecha y hora <span className="muted">(UTC) ↓</span></th>
            <th scope="col">Nivel</th>
            <th scope="col">Servicio</th>
            <th scope="col">Mensaje</th>
            <th scope="col">Traza</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} data-selected={selected.has(log.id)}>
              <td>
                <input type="checkbox" aria-label={`Seleccionar log ${log.id}`} checked={selected.has(log.id)}
                  onChange={(event) => onSelect([log.id], event.target.checked)} />
              </td>
              <td><Timestamp value={log.timestamp} /></td>
              <td><Severity level={log.level} /></td>
              <td className="service-cell mono">{log.service}</td>
              <td>
                <button type="button" className="message-button mono" aria-label={`Abrir log ${log.id}: ${log.message}`}
                  onClick={() => onDetail(log)}>{log.message}</button>
              </td>
              <td>
                {log.traceId ? (
                  <button type="button" className="text-button trace-button mono" title={log.traceId}
                    aria-label={`Ver traza ${log.traceId}`} onClick={() => onTrace(log.traceId)}>
                    {log.traceId}
                  </button>
                ) : <span className="muted">Sin traza</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Explorer({
  filters, onFilters, onDetail, onTrace, analysisBusy, onAnalyze, onResetSubmission, children,
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const recordsTitle = useRef(null);
  const logs = useQuery(logsOptions(filters, offset));
  const summary = useQuery(summaryOptions(filters));
  const catalog = useQuery(summaryOptions({}));
  const summaryItems = catalog.data?.items ?? [];
  const options = {
    service: [...new Set(summaryItems.map(({ service }) => service))],
    level: [...new Set(summaryItems.map(({ level }) => level))].sort(),
  };
  const hasLogs = logs.data?.items.length > 0;
  const summaryTotal = summary.data?.items.reduce((total, { count }) => total + count, 0);
  const filterScope = summaryTotal === undefined
    ? 'Analizar filtros'
    : `Analizar filtros (${countFormat.format(summaryTotal)})`;

  function applyFilters(next) {
    const changed = Object.keys(next).length !== Object.keys(filters).length ||
      Object.entries(next).some(([name, value]) => filters[name] !== value);
    if (changed) {
      setOffset(0);
      setSelected(new Set());
      onResetSubmission();
      onFilters(next);
    }
  }

  function select(ids, checked) {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function paginate(next) {
    setOffset(next);
    recordsTitle.current.focus();
  }

  return (
    <>
      <div className="page-heading">
        <h1>Explorador de logs</h1>
        <p>Filtra eventos y sigue trazas entre servicios.</p>
      </div>
      <FilterForm names={logFields} filters={filters} options={options} onApply={applyFilters} />
      <Summary query={summary} />
      <section className="panel records-panel" aria-labelledby="records-title">
        <div className="section-header">
          <h2 id="records-title" ref={recordsTitle} tabIndex={-1}>Registros</h2>
          <div className="record-actions">
            {selected.size > 0 && (
              <button type="button" className="text-button clear-selection"
                onClick={() => setSelected(new Set())}>Limpiar selección</button>
            )}
            <button type="button" className="button outline" onClick={() => onAnalyze({ filters })}
              disabled={analysisBusy || (!hasLogs && !(summaryTotal > 0))}
              title="Analizar todos los registros que coinciden con los filtros aplicados">
              {filterScope}
            </button>
            <button type="button" className="button primary" disabled={analysisBusy || selected.size === 0}
              onClick={() => onAnalyze({ logIds: [...selected] })}>
              Analizar selección{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          </div>
        </div>
        {children}
        {logs.isPending ? <Notice>Cargando registros…</Notice> :
          logs.isError ? <Notice tone="error" title="No se pudieron cargar los registros." onRetry={logs.refetch}>{logs.error.message}</Notice> :
            <>
              {hasLogs ? (
                <LogTable logs={logs.data.items} selected={selected} onSelect={select} onDetail={onDetail} onTrace={onTrace} />
              ) : <Notice title="No hay registros">Prueba con otros filtros o limpia la selección de filtros.</Notice>}
              {(hasLogs || offset > 0) && <Pagination page={logs.data} onPage={paginate} />}
            </>}
      </section>
    </>
  );
}
