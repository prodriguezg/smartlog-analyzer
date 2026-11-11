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
| <http://127.0.0.1:8080/api/health> | `200` si MySQL responde y `503` si la API no puede consultarlo |
| <http://127.0.0.1:8080/api/docs/> | Swagger UI |
| <http://127.0.0.1:8080/api/openapi.yaml> | Contrato OpenAPI |
| <http://127.0.0.1:8081> | phpMyAdmin para inspeccionar MySQL |

Nginx sirve React y reenvía `/api/` a Express por la red interna de Compose. Express y phpMyAdmin se conectan a MySQL por esa red. MySQL guarda los datos en el volumen `mysql-data`, que se conserva al ejecutar `docker compose down`.

Compose arranca con valores locales predeterminados. Puedes copiar `.env.example` a `.env` para configurar `APP_PORT` y `PHPMYADMIN_PORT`, los puertos locales de la aplicación y phpMyAdmin. MySQL aplica `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_ROOT_PASSWORD` al inicializar un volumen nuevo.

En phpMyAdmin, inicia sesión con `MYSQL_USER` y `MYSQL_PASSWORD` y elige la base `MYSQL_DATABASE` en la barra lateral. Con los valores predeterminados, usa el usuario `smartlog`, la contraseña `smartlog-dev` y la base `smartlog`. La pestaña **Estructura** muestra las tablas y, al elegir una, sus columnas e índices.

## Desarrollo con recarga automática

Usa una versión de Docker Compose que admita Compose Watch.

```bash
docker compose -f docker-compose.yml -f compose.dev.yml up --build --watch
```

En este modo, Vite sirve React en el puerto publicado y reenvía `/api/` a Express. Compose Watch sincroniza el código con los contenedores y reinicia Express después de cada cambio en `backend/src/`. Vite aplica los cambios del frontend en el navegador. Los cambios en los manifiestos de npm o el lockfile reconstruyen las imágenes correspondientes.

## Comprobaciones

Usa Node.js 24 y npm desde la raíz del monorepo. Las pruebas de integración requieren Docker activo. Testcontainers levanta una instancia temporal de MySQL 8.4 para comprobar el endpoint de estado.

```bash
npm ci
npm run lint
npm run build
npm test
```
