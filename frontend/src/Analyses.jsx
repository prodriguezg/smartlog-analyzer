import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import AnalysisResult from './AnalysisResult.jsx';
import { analysesOptions, analysisOptions, submitAnalysis } from './api.js';
import { AnalysisProvider, Notice, Pagination, Timestamp } from './ui.jsx';

function AnalysisList({ items, onOpen }) {
  return (
    <ul className="saved-analyses">
      {items.map(({ id, status, createdAt, provider }) => (
        <li key={id}>
          <div className="saved-analysis-details">
            <strong>Análisis #{id}</strong>
            <span className="muted"><Timestamp value={createdAt} /> UTC</span>
          </div>
          <div className="saved-analysis-labels">
            <span className={`severity severity--${status === 'COMPLETED' ? 'info' : 'error'}`}>
              {status === 'COMPLETED' ? 'Completado' : 'Fallido'}
            </span>
            {provider && <AnalysisProvider provider={provider} showLabel />}
          </div>
          <button type="button" className="button outline" aria-label={`Ver detalle del análisis #${id}`}
            onClick={() => onOpen(id)}>Ver detalle</button>
        </li>
      ))}
    </ul>
  );
}

export default function Analyses({ onAccepted, onDetail }) {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const title = useRef(null);
  const list = useQuery({ ...analysesOptions(offset), enabled: selectedId === null });
  // App tracks retries even after the user leaves the detail.
  const analysis = useQuery({ ...analysisOptions(selectedId), refetchInterval: false });
  const submission = useMutation({
    mutationFn: submitAnalysis,
    onSuccess: ({ id }) => onAccepted(id),
  });

  function selectAnalysis(id) {
    submission.reset();
    setSelectedId(id);
    title.current.focus();
  }

  function retry(body) {
    submission.mutate(body, { onSuccess: ({ id }) => selectAnalysis(id) });
  }

  function paginate(next) {
    setOffset(next);
    title.current.focus();
  }

  return (
    <>
      <div className="page-heading">
        <h1 ref={title} tabIndex={-1}>Análisis</h1>
      </div>
      {selectedId === null ? (
        <section className="panel" aria-label="Análisis finalizados">
          {list.isPending ? <Notice>Cargando análisis…</Notice> :
            list.isError ? (
              <Notice tone="error" title="No se pudieron cargar los análisis." onRetry={list.refetch}>
                {list.error.message}
              </Notice>
            ) : (
              <>
                {list.data.items.length > 0 ? <AnalysisList items={list.data.items} onOpen={selectAnalysis} /> :
                  <Notice title={offset === 0 ? 'Todavía no hay análisis finalizados.' : 'Esta página no tiene análisis.'} />}
                {(list.data.items.length > 0 || offset > 0) && <Pagination page={list.data} onPage={paginate} />}
              </>
            )}
        </section>
      ) : (
        <div>
          <div className="section-header">
            <button type="button" className="button" onClick={() => selectAnalysis(null)}>Volver al listado</button>
          </div>
          <AnalysisResult id={selectedId} analysis={analysis} submission={submission} onRetry={retry}
            onDetail={onDetail} heading="h2" />
        </div>
      )}
    </>
  );
}
