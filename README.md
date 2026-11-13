# SmartLog Analyzer

La base del proyecto levanta una interfaz React, una API Express y MySQL 8.4. La pantalla inicial muestra si la API puede consultar la base de datos. El diseño del prototipo está en [ARCHITECTURE.md](ARCHITECTURE.md).

## Arranque

Con Docker activo, ejecuta el siguiente comando desde la raíz del repositorio.

```bash
docker compose up --build
```

| URL | Contenido |
| --- | --- |
| <http://127.0.0.1:8080> | Interfaz y estado del sistema |
| <http://127.0.0.1:8080/api/health> | `200` con `ok` si MySQL y el proveedor están disponibles, `200` con `degraded` si solo falla el proveedor y `503` con `unavailable` si falla MySQL |
| <http://127.0.0.1:8080/api/docs/> | Swagger UI |
| <http://127.0.0.1:8080/api/openapi.yaml> | Contrato OpenAPI |
| <http://127.0.0.1:8081> | phpMyAdmin para inspeccionar MySQL |

Nginx sirve React y reenvía `/api/` a Express por la red interna de Compose. Express y phpMyAdmin se conectan a MySQL por esa red. MySQL guarda los datos en el volumen `mysql-data`, que se conserva al ejecutar `docker compose down`.

Compose arranca con valores locales predeterminados. Puedes copiar `.env.example` a `.env` para configurar `APP_PORT` y `PHPMYADMIN_PORT`, los puertos locales de la aplicación y phpMyAdmin. MySQL aplica `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_ROOT_PASSWORD` al inicializar un volumen nuevo.

En phpMyAdmin, inicia sesión con `MYSQL_USER` y `MYSQL_PASSWORD` y elige la base `MYSQL_DATABASE` en la barra lateral. Con los valores predeterminados, usa el usuario `smartlog`, la contraseña `smartlog-dev` y la base `smartlog`. La pestaña **Estructura** muestra las tablas y, al elegir una, sus columnas e índices.

El proveedor predeterminado es `mock`. Para comprobar OpenAI con Compose, configura `LLM_PROVIDER=openai`, `OPENAI_API_KEY` y `OPENAI_MODEL` en `.env`.

El tamaño de una selección de análisis se configura con `ANALYSIS_MAX_LOGS` y `ANALYSIS_MAX_KIB`. Los valores predeterminados son 100 logs y 32 KiB de logs serializados en UTF-8. Ambas variables aceptan enteros positivos. Si la selección supera alguno de los topes, la API devuelve `422` con el límite que se superó.

## Demo con los logs de ejemplo

Al iniciar, el backend carga 31 logs de ejemplo del 12 de noviembre de 2026 entre las 14:02 y las 14:11 UTC. En [Swagger UI](http://127.0.0.1:8080/api/docs/) puedes usar **Try it out** para recorrer una compra que falló por un timeout.

1. Ejecuta `GET /logs/summary` con `from=2026-11-12T14:02:00Z` y `to=2026-11-12T14:11:00Z` para ver los conteos por servicio y nivel. El inicio es inclusivo y el fin es exclusivo.
2. Ejecuta `GET /logs` con `traceId=1d42b7d538724fae95c962e3d06cc5db`. La traza tiene seis logs de `checkout-api`, `inventory-service` y `payment-service`.
3. Ejecuta `POST /logs/analyze` con el ejemplo `byFilters` para analizar la traza completa. Para analizar logs específicos, usa `byIds` con los IDs de los logs que devuelve el paso anterior.
4. Consulta `GET /analysis/{id}` con el ID de la respuesta `202`. Cuando el estado sea `COMPLETED`, revisa el informe y sus logs de evidencia. Con el proveedor mock y la traza completa, verás un hallazgo `timeout` respaldado por dos logs.
5. Ejecuta `GET /analysis/findings` con `category=timeout` para consultar el hallazgo y `GET /categories` para ver el catálogo.

Si analizas todo el intervalo de ejemplo con el mock, también verás `dependency_failure` por la caída temporal del proveedor de pagos y `resource_exhaustion` por el stock insuficiente. Una compra exitosa y un rechazo por fondos insuficientes, analizados por separado, devuelven un informe sin hallazgos.

## Desarrollo con recarga automática

Usa una versión de Docker Compose que admita Compose Watch.

```bash
docker compose -f docker-compose.yml -f compose.dev.yml up --build --watch
```

En este modo, Vite sirve React en el puerto publicado y reenvía `/api/` a Express. Compose Watch sincroniza el código con los contenedores y reinicia Express después de cada cambio en `backend/src/`. Vite aplica los cambios del frontend en el navegador. Los cambios en los manifiestos de npm o el lockfile reconstruyen las imágenes correspondientes.

### Depurar el backend en VS Code

1. Levanta Compose con el comando de desarrollo anterior y abre la raíz del repositorio en VS Code.
2. En **Run and Debug**, selecciona **Backend (Docker Compose)** y presiona **F5**.
3. Pon un breakpoint en el handler de `backend/src/router/health-router.js` y abre `http://127.0.0.1:8080/api/health` (usa tu `APP_PORT` si lo cambiaste). Usa **Step Over (F10)** para avanzar una línea, **Step Into (F11)** para entrar en una llamada y **Continue (F5)** para completar la petición.

El inspector se publica en `127.0.0.1:9229` con `compose.dev.yml`. VS Code vuelve a conectarse cuando Compose Watch reinicia el backend.

## Comprobaciones

Usa Node.js 24 y npm desde la raíz del monorepo. Las pruebas de integración requieren Docker activo. Testcontainers levanta instancias temporales de MySQL 8.4 para comprobar las migraciones y la API.

```bash
npm ci
npm run lint
npm run build
npm test
```
