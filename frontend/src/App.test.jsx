// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const timestamp = '2026-11-12T14:06:19.048Z';
const traceId = '1d42b7d538724fae95c962e3d06cc5db';
const timeout = {
  id: 21, timestamp, traceId, service: 'payment-service', level: 'ERROR', message: 'Payment provider connection timeout',
};
const checkout = { ...timeout, id: 23, service: 'checkout-api', message: 'Checkout failed after payment timeout' };
const noTrace = { id: 32, timestamp, service: 'checkout-api', level: 'INFO', message: 'Readiness probe passed' };
const categories = [{ code: 'timeout', description: 'Se agotó el tiempo de espera.' }];
const finding = {
  id: 1, analysisId: 1, category: 'timeout', description: 'El proveedor excedió el tiempo de espera.',
  suggestion: 'Revisar la latencia del proveedor.', evidence: [timeout, checkout],
};
const pending = { id: 1, status: 'PENDING', logIds: [21, 23] };
const complete = { ...pending, status: 'COMPLETED', provider: 'mock', report: { summary: 'Informe listo.', findings: [finding] } };

function page(items, params, hasMore = false) {
  return { items, hasMore, limit: Number(params.get('limit')), offset: Number(params.get('offset')) };
}

function json(data, status = 200) {
  return Response.json(data, { status });
}

function mount(handlers = {}) {
  const requests = [];
  const fetchMock = vi.fn(async (resource, init) => {
    const { pathname, searchParams } = new URL(resource, 'http://localhost');
    const body = init?.body ? JSON.parse(init.body) : undefined;
    requests.push({ pathname, params: Object.fromEntries(searchParams), body });
    if (handlers[pathname]) return handlers[pathname](searchParams, body);

    switch (pathname) {
      case '/api/health':
        return json({ status: 'ok', checks: { database: 'ok', provider: { status: 'ok' } } });
      case '/api/logs':
        return json(page([timeout, checkout, noTrace], searchParams));
      case '/api/logs/summary':
        return json({ items: [{ service: timeout.service, level: timeout.level, count: 3 }] });
      case '/api/categories':
        return json({ items: categories });
      case '/api/analysis/findings':
        return json(page([finding], searchParams));
      case '/api/logs/analyze':
        return json({ id: 1, status: 'PENDING' }, 202);
      case '/api/analysis/1':
        return json(complete);
      default:
        throw new Error(`Unexpected request: ${pathname}`);
    }
  });
  vi.stubGlobal('fetch', fetchMock);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  return { user: userEvent.setup(), requests };
}

beforeAll(() => {
  // jsdom does not implement modal dialog methods. Chromium exercises their native behavior.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.open = true; } },
    close: { configurable: true, value() { this.open = false; } },
  });
});

afterAll(() => {
  delete HTMLDialogElement.prototype.showModal;
  delete HTMLDialogElement.prototype.close;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SmartLog', () => {
  it('lists logs, preserves selected IDs across pages and clears them when filters change', async () => {
    const { user, requests } = mount({
      '/api/logs': (params) => {
        if (params.get('service')) return json(page([timeout], params));
        if (params.get('offset') === '10') return json(page([checkout], params));
        return json(page([timeout], params, true));
      },
    });

    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar log 21' }));
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar log 23' }));
    expect(screen.getByRole('button', { name: 'Analizar selección (2)' }).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: /Anterior/ }));
    expect((await screen.findByRole('checkbox', { name: 'Seleccionar log 21' })).checked).toBe(true);

    await user.type(screen.getByLabelText('Servicio'), 'payment-service');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect((await screen.findByRole('checkbox', { name: 'Seleccionar log 21' })).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Analizar selección' }).disabled).toBe(true);
    expect(requests).toContainEqual({
      pathname: '/api/logs', params: { service: 'payment-service', limit: '10', offset: '0' }, body: undefined,
    });
    expect(requests).toContainEqual({
      pathname: '/api/logs/summary', params: { service: 'payment-service' }, body: undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByLabelText('Servicio').value).toBe('');
  });

  it('distinguishes loading, failure and no matching logs, and can retry the list', async () => {
    let resolveFirstPage;
    const firstPage = new Promise((resolve) => { resolveFirstPage = resolve; });
    let attempts = 0;
    const { user } = mount({
      '/api/logs': (params) => ++attempts === 1 ? firstPage : json(page([], params)),
      '/api/logs/summary': () => json({ items: [] }),
    });

    const records = within(screen.getByRole('region', { name: 'Registros' }));
    expect(records.getByText('Cargando registros…')).toBeTruthy();
    resolveFirstPage(json({ error: { message: 'MySQL no está disponible.' } }, 503));
    expect(await records.findByText('No se pudieron cargar los registros.')).toBeTruthy();
    await user.click(records.getByRole('button', { name: 'Reintentar' }));
    expect(await records.findByText('No hay registros')).toBeTruthy();
    expect(records.getByRole('button', { name: 'Analizar filtros (0)' }).disabled).toBe(true);
  });

  it('validates date ranges and sends valid dates as UTC with millisecond precision', async () => {
    const { user, requests } = mount();
    await screen.findByRole('checkbox', { name: 'Seleccionar log 21' });
    await user.type(screen.getByLabelText('Desde'), '2026-11-12T15:00');
    await user.type(screen.getByLabelText('Hasta'), '2026-11-12T14:00');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(screen.getByRole('alert').textContent).toContain('La fecha Desde debe ser anterior a Hasta.');
    expect(requests.some(({ params }) => params.from)).toBe(false);

    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '2026-11-12T16:00');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(requests).toContainEqual({
      pathname: '/api/logs',
      params: { from: '2026-11-12T15:00:00.000Z', to: '2026-11-12T16:00:00.000Z', limit: '10', offset: '0' },
      body: undefined,
    }));
  });

  it('opens full log details and follows a trace across services', async () => {
    const { user, requests } = mount({
      '/api/logs': (params) => json(page(params.has('traceId') ? [timeout, checkout] : [timeout, checkout, noTrace], params)),
    });
    await user.click(await screen.findByRole('button', { name: /Abrir log 32/ }));
    const withoutTrace = within(screen.getByRole('dialog'));
    expect(withoutTrace.getByText('Sin traza')).toBeTruthy();
    expect(withoutTrace.queryByRole('button', { name: 'Ver traza' })).toBeNull();
    await user.click(withoutTrace.getByRole('button', { name: 'Cerrar detalle' }));

    const logButton = await screen.findByRole('button', { name: /Abrir log 21/ });
    await user.click(logButton);
    const detail = within(screen.getByRole('dialog', { name: 'Detalle del log' }));
    expect(detail.getByText(timeout.message)).toBeTruthy();
    expect(detail.getByText(traceId)).toBeTruthy();
    await user.click(detail.getByRole('button', { name: 'Ver traza' }));
    await waitFor(() => expect(requests).toContainEqual({
      pathname: '/api/logs', params: { traceId, limit: '10', offset: '0' }, body: undefined,
    }));
    expect(screen.getByLabelText('ID de traza').value).toBe(traceId);
    expect(await screen.findByRole('button', { name: /Abrir log 23/ })).toBeTruthy();

    expect(screen.queryByRole('button', { name: /Abrir log 32/ })).toBeNull();
  });

  it('submits filters, polls until completion, and lets the user inspect evidence', async () => {
    let reads = 0;
    const { user, requests } = mount({
      '/api/analysis/1': () => json(++reads === 1 ? pending : complete),
    });
    await user.type(screen.getByLabelText('ID de traza'), traceId);
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await user.click(await screen.findByRole('button', { name: /Analizar filtros/ }));
    expect(await screen.findByText('Análisis pendiente')).toBeTruthy();
    expect(screen.queryByText(/^Proveedor:/)).toBeNull();
    expect(await screen.findByText('Informe listo.', {}, { timeout: 3500 })).toBeTruthy();
    expect(screen.getByText('Proveedor: Mock')).toBeTruthy();
    expect(requests.filter(({ pathname }) => pathname === '/api/logs/analyze')).toEqual([
      { pathname: '/api/logs/analyze', params: {}, body: { filters: { traceId } } },
    ]);

    await user.click(screen.getByText('Ver evidencia (2)'));
    const analysis = screen.getByRole('region', { name: 'Análisis #1' });
    const evidence = within(analysis).getByRole('button', { name: new RegExp(timeout.message) });
    await user.click(evidence);
    expect(within(screen.getByRole('dialog')).getByText(timeout.message)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(reads).toBe(2);
  }, 8000);

  it.each(['openai', null])('retries the correct operation after a failed analysis with provider %s', async (provider) => {
    let reads = 0;
    const { user, requests } = mount({
      '/api/analysis/1': () => ++reads === 1
        ? json({ error: { message: 'Error temporal de conexión' } }, 503)
        : json({ ...pending, status: 'FAILED', provider, error: { message: 'El análisis no pudo completarse.' } }),
      '/api/logs/analyze': (_params, body) => json({ id: body.logIds?.length === 2 ? 2 : 1, status: 'PENDING' }, 202),
      '/api/analysis/2': () => json({ ...complete, id: 2, report: { summary: 'Nuevo informe.', findings: [] } }),
    });
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar log 21' }));
    await user.click(screen.getByRole('button', { name: 'Analizar selección (1)' }));
    expect(await screen.findByText('Error temporal de conexión')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('El análisis no pudo completarse.')).toBeTruthy();
    if (provider) expect(screen.getByText('Proveedor: OpenAI')).toBeTruthy();
    else expect(screen.queryByText(/^Proveedor:/)).toBeNull();
    expect(requests.filter(({ pathname }) => pathname === '/api/logs/analyze')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reintentar con los mismos logs' }));
    expect(await screen.findByText('El análisis terminó sin hallazgos.')).toBeTruthy();
    expect(screen.getByText('Proveedor: Mock')).toBeTruthy();
    expect(requests.filter(({ pathname }) => pathname === '/api/logs/analyze').map(({ body }) => body)).toEqual([
      { logIds: [21] }, { logIds: [21, 23] },
    ]);
  });

  it.each([413, 422])('shows server selection errors (HTTP %i) and keeps selection editable', async (status) => {
    const { user } = mount({
      '/api/logs/analyze': () => json({ error: { message: 'Selecciona menos logs.' } }, status),
    });
    const checkbox = await screen.findByRole('checkbox', { name: 'Seleccionar log 21' });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Analizar selección (1)' }));
    expect(await screen.findByText('Selecciona menos logs.')).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    await user.click(checkbox);
    expect(screen.getByRole('button', { name: 'Analizar selección' }).disabled).toBe(true);
  });

  it('opens completed reports and retries failed analyses while preserving the list page', async () => {
    const completedRow = { id: 1, status: 'COMPLETED', createdAt: timestamp, provider: 'mock' };
    const failedRow = { id: 2, status: 'FAILED', createdAt: timestamp, provider: null };
    let retryReads = 0;
    const { user, requests } = mount({
      '/api/analysis': (params) => params.get('offset') === '0'
        ? json(page([completedRow], params, true))
        : json(page([failedRow], params)),
      '/api/analysis/2': () => json({ ...pending, ...failedRow, error: { message: 'Falló el intento anterior.' } }),
      '/api/logs/analyze': () => json({ id: 3, status: 'PENDING' }, 202),
      '/api/analysis/3': () => json(++retryReads === 1
        ? { ...pending, id: 3 }
        : { ...complete, id: 3, report: { summary: 'Nuevo informe.', findings: [] } }),
    });

    await user.click(screen.getByRole('button', { name: 'Análisis', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Ver detalle del análisis #1' }));
    expect(await screen.findByText('Informe listo.')).toBeTruthy();
    await user.click(screen.getByText('Ver evidencia (2)'));
    await user.click(screen.getByRole('button', { name: new RegExp(checkout.message) }));
    expect(within(screen.getByRole('dialog')).getByText(checkout.message)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }));
    await user.click(await screen.findByRole('button', { name: 'Siguiente' }));
    await user.click(await screen.findByRole('button', { name: 'Ver detalle del análisis #2' }));
    expect(await screen.findByText('Falló el intento anterior.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar con los mismos logs' }));
    expect(await screen.findByText('Análisis pendiente')).toBeTruthy();
    expect(await screen.findByText('Nuevo informe.', {}, { timeout: 3500 })).toBeTruthy();
    expect(requests.filter(({ pathname }) => pathname === '/api/logs/analyze')).toEqual([
      { pathname: '/api/logs/analyze', params: {}, body: { logIds: [21, 23] } },
    ]);

    await user.click(screen.getByRole('button', { name: 'Volver al listado' }));
    expect(await screen.findByLabelText('Página 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver detalle del análisis #2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Siguiente' }).disabled).toBe(true);
    expect(requests).toContainEqual({ pathname: '/api/analysis', params: { limit: '10', offset: '10' }, body: undefined });
  }, 8000);

  it('can retry loading the saved analyses and shows when there are no results', async () => {
    let reads = 0;
    const { user } = mount({
      '/api/analysis': (params) => ++reads === 1
        ? json({ error: { message: 'MySQL no está disponible.' } }, 503)
        : json(page([], params)),
    });
    await user.click(screen.getByRole('button', { name: 'Análisis', exact: true }));
    expect(await screen.findByText('No se pudieron cargar los análisis.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay análisis finalizados.')).toBeTruthy();
  });

  it('filters and pages findings with the catalog and leaves evidence available when the provider is degraded', async () => {
    const { user, requests } = mount({
      '/api/health': () => json({ status: 'degraded', checks: { database: 'ok', provider: { status: 'unavailable' } } }),
      '/api/analysis/findings': (params) => json(page([finding], params, params.get('offset') === '0')),
    });
    expect(await screen.findByText('Proveedor degradado')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hallazgos' }));
    await user.selectOptions(screen.getByLabelText('Categoría'), await screen.findByRole('option', { name: 'timeout' }));
    await user.type(screen.getByLabelText('Servicio'), 'payment-service');
    await user.type(screen.getByLabelText('Desde'), '2026-11-12T14:00');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await user.click(await screen.findByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(requests).toContainEqual({
      pathname: '/api/analysis/findings',
      params: { category: 'timeout', service: 'payment-service', from: '2026-11-12T14:00:00.000Z', limit: '10', offset: '10' },
      body: undefined,
    }));
    expect(await screen.findByText(finding.suggestion)).toBeTruthy();
    await user.click(screen.getByText('Ver evidencia (2)'));
    expect(screen.getByRole('button', { name: new RegExp(checkout.message) })).toBeTruthy();
  });
});
