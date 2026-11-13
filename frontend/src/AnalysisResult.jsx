import { useQuery } from '@tanstack/react-query';
import { categoriesOptions } from './api.js';
import { AnalysisProvider, FindingList, Notice } from './ui.jsx';

function AnalysisReport({ report, onDetail, heading: Heading }) {
  const categories = useQuery({ ...categoriesOptions, enabled: report.findings.length > 0 });
  return (
    <div className="analysis-report">
      <Heading>Resumen del análisis</Heading>
      <p>{report.summary}</p>
      {report.findings.length === 0 ? <p className="muted">El análisis terminó sin hallazgos.</p> :
        <FindingList findings={report.findings}
          categories={new Map(categories.data?.items.map(({ code, description }) => [code, description]))}
          onDetail={onDetail} />}
    </div>
  );
}

export default function AnalysisResult({
  id, analysis, submission, onRetry, onDetail, heading: Heading = 'h3',
}) {
  if (id === null && !submission.isPending && !submission.isError) return null;
  const result = analysis.data;
  const provider = result?.provider;
  return (
    <section className="analysis-panel" aria-labelledby="analysis-title">
      <div className="analysis-header">
        <Heading id="analysis-title">Análisis{id !== null ? ` #${id}` : ''}</Heading>
        {provider ? <AnalysisProvider provider={provider} showLabel /> : null}
      </div>
      {submission.isPending && <Notice>Enviando la selección…</Notice>}
      {submission.isError && (
        <Notice tone="error" title="No se pudo iniciar el análisis.">{submission.error.message}</Notice>
      )}
      {id !== null && (analysis.isError ? (
        <Notice tone="error" title="No se pudo consultar el estado del análisis." onRetry={analysis.refetch}>
          {analysis.error.message}
        </Notice>
      ) : !result ? (
        <Notice>Cargando análisis…</Notice>
      ) : result.status === 'PENDING' ? (
        <Notice title="Análisis pendiente">El informe aparecerá cuando termine el análisis.</Notice>
      ) : result.status === 'FAILED' ? (
        <div className="analysis-failure">
          <Notice tone="error" title="El análisis falló.">{result.error.message}</Notice>
          <button type="button" className="button outline" disabled={submission.isPending}
            onClick={() => onRetry({ logIds: result.logIds })}>Reintentar con los mismos logs</button>
        </div>
      ) : (
        <AnalysisReport report={result.report} onDetail={onDetail} heading={Heading === 'h2' ? 'h3' : 'h4'} />
      ))}
    </section>
  );
}
