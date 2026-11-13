import { useId, useState } from 'react';

const fields = {
  service: ['Servicio', 'text', 'Todos los servicios'],
  level: ['Nivel', 'text', 'Todos los niveles'],
  from: ['Desde', 'datetime-local'],
  to: ['Hasta', 'datetime-local'],
  traceId: ['ID de traza', 'text', 'Todas las trazas'],
  category: ['Categoría', 'select'],
};

function defaultValue(filters, name) {
  const value = filters[name] ?? '';
  return fields[name][1] === 'datetime-local' ? value.replace(/Z$/, '') : value;
}

export default function FilterForm({ names, filters, options, onApply, categoryQuery }) {
  const id = useId();
  const [error, setError] = useState('');

  function apply(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = {};
    for (const name of names) {
      const value = values.get(name);
      if (value) {
        next[name] = fields[name][1] === 'datetime-local' ? new Date(`${value}Z`).toISOString() : value;
      }
    }
    if (next.from && next.to && next.from >= next.to) {
      setError('La fecha Desde debe ser anterior a Hasta.');
      return;
    }

    setError('');
    onApply(next);
  }

  function clear(event) {
    for (const name of names) {
      event.currentTarget.form.elements.namedItem(name).value = '';
    }
    setError('');
    onApply({});
  }

  return (
    <form className="panel filter-panel" aria-label="Filtros" onSubmit={apply}>
      <div className="filter-grid">
        {names.map((name) => {
          const [label, type, placeholder] = fields[name];
          const fieldId = `${id}-${name}`;
          const choices = options[name];
          return (
            <div className={`filter-field filter-field--${name}`} key={name}>
              <label htmlFor={fieldId}>{label}</label>
              {type === 'select' ? (
                <select id={fieldId} name={name} defaultValue={defaultValue(filters, name)}>
                  <option value="">Todas las categorías</option>
                  {choices?.map(({ code, description }) => <option key={code} value={code} title={description}>{code}</option>)}
                </select>
              ) : (
                <input
                  id={fieldId}
                  name={name}
                  type={type}
                  placeholder={placeholder}
                  defaultValue={defaultValue(filters, name)}
                  list={choices?.length ? `${fieldId}-options` : undefined}
                  step={type === 'datetime-local' ? '0.001' : undefined}
                  max={type === 'datetime-local' ? '9999-12-31T23:59:59.999' : undefined}
                  aria-invalid={type === 'datetime-local' && error ? true : undefined}
                  aria-describedby={type === 'datetime-local' ? `${id}-timezone${error ? ` ${id}-error` : ''}` : undefined}
                />
              )}
              {type === 'text' && choices?.length > 0 && (
                <datalist id={`${fieldId}-options`}>
                  {choices.map((choice) => <option key={choice} value={choice} />)}
                </datalist>
              )}
            </div>
          );
        })}
        <button type="submit" className="button primary apply-filters">Aplicar filtros</button>
      </div>
      <div className="filter-footer">
        <p id={`${id}-timezone`}>Fechas en UTC <span aria-hidden="true">·</span> Inicio incluido, fin excluido</p>
        <button type="button" className="text-button" onClick={clear}>Limpiar filtros</button>
      </div>
      {error && <p className="form-error" role="alert" id={`${id}-error`}>{error}</p>}
      {categoryQuery?.isError && (
        <p className="form-error" role="alert">
          No se pudo cargar el catálogo de categorías.{' '}
          <button type="button" className="text-button" onClick={() => categoryQuery.refetch()}>Reintentar catálogo</button>
        </p>
      )}
    </form>
  );
}
