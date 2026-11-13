import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analysesKey, analysisOptions, healthOptions, submitAnalysis } from './api.js';
import Analyses from './Analyses.jsx';
import Explorer from './Explorer.jsx';
import Findings from './Findings.jsx';
import AnalysisResult from './AnalysisResult.jsx';
import { LogDetail } from './ui.jsx';

const healthLabels = {
  ok: 'Operativo',
  degraded: 'Proveedor degradado',
  unavailable: 'MySQL no disponible',
};

function SystemStatus() {
  const health = useQuery(healthOptions);
  const status = health.data?.status;
  const label = health.isFetching ? 'Comprobando…' :
    health.isError ? 'API no disponible' : healthLabels[status] ?? 'Estado desconocido';
  const reason = health.data?.checks.provider.reason;
  return (
    <button type="button" className="text-button health-button"
      onClick={() => health.refetch()} disabled={health.isFetching}
      title={reason ?? 'Comprobar el estado del sistema'}>
      <span className={`status-dot status-dot--${health.isFetching ? 'pending' : health.isError ? 'unavailable' : status}`} aria-hidden="true" />
      <span role="status">{label}</span>
      <span aria-hidden="true" className="refresh-mark">↻</span>
    </button>
  );
}

function useRefreshOnAnalysisResult(result) {
  const queryClient = useQueryClient();
  const id = result?.id;
  const status = result?.status;

  useEffect(() => {
    if (status === 'COMPLETED' || status === 'FAILED') {
      void queryClient.invalidateQueries({ queryKey: analysesKey });
    }
    if (status === 'COMPLETED') {
      void queryClient.invalidateQueries({ queryKey: ['analysis/findings'] });
    }
  }, [id, status, queryClient]);
}

export default function App() {
  const [view, setView] = useState('explorer');
  const [filters, setFilters] = useState({});
  const [filterVersion, setFilterVersion] = useState(0);
  const [detail, setDetail] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [retryId, setRetryId] = useState(null);
  const mainRef = useRef(null);
  const analysis = useQuery(analysisOptions(analysisId));
  const retry = useQuery(analysisOptions(retryId));
  useRefreshOnAnalysisResult(analysis.data);
  useRefreshOnAnalysisResult(retry.data);
  const status = analysis.data?.status;
  const submission = useMutation({
    mutationFn: submitAnalysis,
    onSuccess: ({ id }) => setAnalysisId(id),
  });

  const analysisBusy = submission.isPending || (analysisId !== null &&
    status !== 'COMPLETED' && status !== 'FAILED' && analysis.error?.status !== 404);

  function showTrace(traceId) {
    setView('explorer');
    setFilters({ traceId });
    setFilterVersion((version) => version + 1);
    if (!submission.isPending) submission.reset();
    mainRef.current.focus();
  }

  function analyze(body) {
    submission.mutate(body);
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Ir al contenido</a>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">SmartLog Analyzer</span>
          <nav className="main-nav" aria-label="Navegación principal">
            <button type="button" aria-current={view === 'explorer' ? 'page' : undefined}
              onClick={() => setView('explorer')}>Explorador</button>
            <button type="button" aria-current={view === 'analyses' ? 'page' : undefined}
              onClick={() => setView('analyses')}>Análisis</button>
            <button type="button" aria-current={view === 'findings' ? 'page' : undefined}
              onClick={() => setView('findings')}>Hallazgos</button>
          </nav>
          <div className="topbar-tools">
            <SystemStatus />
            <a className="api-link" href="/api/docs/" aria-label="Documentación de la API">API <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </header>
      <main id="main-content" className="workspace" ref={mainRef} tabIndex={-1}>
        {view === 'explorer' ? (
          <Explorer key={filterVersion} filters={filters}
            onFilters={setFilters} onDetail={setDetail} onTrace={showTrace} analysisBusy={analysisBusy}
            onAnalyze={analyze} onResetSubmission={() => { if (!submission.isPending) submission.reset(); }}>
            <AnalysisResult id={analysisId} analysis={analysis} submission={submission} onRetry={analyze} onDetail={setDetail} />
          </Explorer>
        ) : view === 'analyses' ? <Analyses onAccepted={setRetryId} onDetail={setDetail} /> : <Findings onDetail={setDetail} />}
      </main>
      {detail && <LogDetail log={detail} onDismiss={() => setDetail(null)} onTrace={showTrace} />}
    </>
  );
}
