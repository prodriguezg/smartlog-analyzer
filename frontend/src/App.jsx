import { useQuery } from '@tanstack/react-query';

async function getHealth({ signal }) {
  const response = await fetch('/api/health', { signal });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check returned ${response.status}`);
  }

  const health = await response.json();
  return health.checks.database;
}

function getStatus({ data, isError, isFetching }) {
  if (isFetching) return { text: 'Comprobando la conexión…', tone: 'pending' };
  if (isError) return { text: 'API no disponible', tone: 'error' };
  if (data === 'ok') return { text: 'API y MySQL disponibles', tone: 'ok' };
  return { text: 'MySQL no disponible', tone: 'error' };
}

export default function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });
  const status = getStatus(health);

  return (
    <main>
      <h1>SmartLog Analyzer</h1>
      <section aria-labelledby="health-title">
        <h2 id="health-title">Estado del sistema</h2>
        <p role="status" className={`status status--${status.tone}`}>{status.text}</p>
        <button type="button" onClick={() => health.refetch()} disabled={health.isFetching}>
          Comprobar de nuevo
        </button>
      </section>
      <a href="/api/docs/">Documentación de la API</a>
    </main>
  );
}
