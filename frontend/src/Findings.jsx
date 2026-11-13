import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { categoriesOptions, findingsOptions, summaryOptions } from './api.js';
import FilterForm from './FilterForm.jsx';
import { FindingList, Notice, Pagination } from './ui.jsx';

const findingFields = ['category', 'service', 'from', 'to'];

export default function Findings({ onDetail }) {
  const [filters, setFilters] = useState({});
  const [offset, setOffset] = useState(0);
  const resultsTitle = useRef(null);
  const findings = useQuery(findingsOptions(filters, offset));
  const categories = useQuery(categoriesOptions);
  const summary = useQuery(summaryOptions({}));
  const options = {
    category: categories.data?.items,
    service: [...new Set(summary.data?.items.map(({ service }) => service))],
  };

  function paginate(next) {
    setOffset(next);
    resultsTitle.current.focus();
  }

  return (
    <>
      <div className="page-heading">
        <h1>Hallazgos</h1>
        <p>Consulta los resultados de los análisis y sus logs de evidencia.</p>
      </div>
      <FilterForm names={findingFields} filters={filters} options={options} categoryQuery={categories}
        onApply={(next) => { setFilters(next); setOffset(0); }} />
      <section className="panel records-panel" aria-labelledby="findings-title">
        <div className="section-header">
          <h2 id="findings-title" ref={resultsTitle} tabIndex={-1}>Resultados</h2>
        </div>
        {findings.isPending ? <Notice>Cargando hallazgos…</Notice> :
          findings.isError ? <Notice tone="error" title="No se pudieron cargar los hallazgos." onRetry={findings.refetch}>{findings.error.message}</Notice> :
            <>
              {findings.data.items.length > 0 ? (
                <FindingList findings={findings.data.items}
                  categories={new Map(categories.data?.items.map(({ code, description }) => [code, description]))}
                  onDetail={onDetail} />
              ) : <Notice title="No hay hallazgos">Los hallazgos aparecen aquí cuando coinciden con los filtros aplicados.</Notice>}
              {(findings.data.items.length > 0 || offset > 0) && <Pagination page={findings.data} onPage={paginate} />}
            </>}
      </section>
    </>
  );
}
