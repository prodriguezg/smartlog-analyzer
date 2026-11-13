export const pageSize = 10;

async function request(path, { params, body, signal } = {}) {
  const query = params ? new URLSearchParams(params).toString() : '';
  const response = await fetch(`/api/${path}${query ? `?${query}` : ''}`, {
    signal,
    ...(body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }).catch((error) => {
    if (error.name === 'AbortError') throw error;
    throw new Error('No se pudo conectar con la API.');
  });
  const data = await response.json().catch(() => null);

  if (path === 'health' && response.status === 503 && data?.checks) return data;
  if (!response.ok) {
    const fallback = response.status === 413
      ? 'El cuerpo de la solicitud supera el límite permitido. Selecciona menos registros.'
      : `La solicitud falló (HTTP ${response.status}).`;
    throw Object.assign(new Error(data?.error?.message ?? fallback), { status: response.status });
  }
  if (data === null) throw new Error('La API no devolvió una respuesta válida.');
  return data;
}

function pageOptions(path, filters, offset) {
  return {
    queryKey: [path, filters, offset],
    retry: false,
    queryFn: ({ signal }) => request(path, { params: { ...filters, limit: pageSize, offset }, signal }),
  };
}

export const logsOptions = (filters, offset) => pageOptions('logs', filters, offset);
export const findingsOptions = (filters, offset) => pageOptions('analysis/findings', filters, offset);

export function summaryOptions(filters) {
  return {
    queryKey: ['logs/summary', filters],
    queryFn: ({ signal }) => request('logs/summary', { params: filters, signal }),
    staleTime: 30_000,
    retry: false,
  };
}

export const categoriesOptions = {
  queryKey: ['categories'],
  queryFn: ({ signal }) => request('categories', { signal }),
  staleTime: 60_000,
  retry: false,
};

export const healthOptions = {
  queryKey: ['health'],
  queryFn: ({ signal }) => request('health', { signal }),
  retry: false,
};

export const submitAnalysis = (body) => request('logs/analyze', { body });

export function analysisOptions(id) {
  return {
    queryKey: ['analysis', id],
    queryFn: ({ signal }) => request(`analysis/${id}`, { signal }),
    enabled: id !== null,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: ({ state }) => state.data?.status === 'PENDING' && !state.error ? 1_500 : false,
  };
}
