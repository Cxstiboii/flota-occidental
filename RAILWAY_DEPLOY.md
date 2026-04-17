# Deploy en Railway + MongoDB Atlas

Este bot esta preparado para desplegarse en Railway como un servicio persistente de Node.js usando `npm start`.

## 1. Antes de subir el repositorio

- No subas `.env`
- Mantén `.env.example` sin secretos
- Rota credenciales si alguna vez estuvieron expuestas:
  - `DISCORD_TOKEN`
  - usuario o password de MongoDB Atlas

## 2. Qué subir al repositorio

Sube:

- `index.js`
- `package.json`
- `package-lock.json`
- `railway.json`
- `src/`
- `.gitignore`
- `.env.example`
- `RAILWAY_DEPLOY.md`

No subas:

- `.env`
- `logs/`
- backups
- archivos locales de pruebas

## 3. Preparar MongoDB Atlas

En MongoDB Atlas:

1. Crea un usuario exclusivo para produccion.
2. Usa una base como `taxi-bot-prod`.
3. En `Network Access`, permite acceso desde Railway.

Si no conoces la IP de salida, puedes empezar con:

```text
0.0.0.0/0
```

Eso es lo mas simple para arrancar, aunque es menos estricto.

URI recomendada:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/taxi-bot-prod?retryWrites=true&w=majority
```

Si la contraseña tiene caracteres especiales como `@`, `:`, `/`, `?` o `#`, debes URL-encodearla.

## 4. Crear el repositorio en GitHub

Desde la raiz del proyecto:

```bash
git init
git add .
git commit -m "Prepare bot for Railway deployment"
```

Luego crea el repo en GitHub y haz push.

## 5. Crear el proyecto en Railway

En Railway:

1. Crea un nuevo proyecto
2. Elige `Deploy from GitHub repo`
3. Selecciona este repositorio
4. Railway detectara Node.js automaticamente con Railpack

Railway puede usar automaticamente `npm start` como start command cuando existe en `package.json`, y tambien puedes fijarlo por config-as-code en `railway.json`.  
Fuente oficial:

- Start command: https://docs.railway.com/deployments/start-command
- Railpack: https://docs.railway.com/reference/nixpacks
- Config as code: https://docs.railway.com/config-as-code

## 6. Variables de entorno en Railway

En la pestaña `Variables` del servicio, pega estas variables en `RAW Editor`:

```env
DISCORD_TOKEN=TU_TOKEN_REAL
CLIENT_ID=TU_CLIENT_ID
GUILD_ID=TU_GUILD_ID
MONGODB_URI=TU_URI_REAL_DE_ATLAS
SYNC_COMMANDS_ON_STARTUP=true
COMMAND_SCOPE=guild
TAXI_CATEGORY_ID=ID_CATEGORIA_TURNOS
TAXI_PANEL_CHANNEL_ID=ID_CANAL_PANEL
TAXI_SHIFT_CHANNEL_PREFIX=turno
ROLE_TAXISTA_ID=ID_ROL_TAXISTA
ROLE_SUPERVISOR_ID=ID_ROL_SUPERVISOR
ROLE_DUENO_ID=ID_ROL_DUENO
```

Si no vas a usar IDs, puedes usar nombres:

```env
ROLE_TAXISTA=Taxista
ROLE_SUPERVISOR=Supervisor
ROLE_DUENO=Dueño
```

Railway soporta cargar variables desde el panel y tambien detecta variables sugeridas a partir de `.env.example`.  
Fuente oficial: https://docs.railway.com/variables

## 7. Comandos slash en Railway

Este proyecto ya esta preparado para sincronizar los comandos al arrancar con:

```env
SYNC_COMMANDS_ON_STARTUP=true
COMMAND_SCOPE=guild
```

`guild` es lo recomendado para este bot porque aplica cambios rapido.  
Si algun dia quieres comandos globales:

```env
COMMAND_SCOPE=global
```

## 8. Configuracion de Discord Developer Portal

En el portal del bot:

1. Ve a `Bot`
2. Activa `Message Content Intent`
3. Guarda cambios

Eso es importante para el flujo de screenshots en los canales de turno.

## 9. Qué hace `railway.json`

Se añadió una configuracion base:

- `startCommand`: `npm start`
- sin healthcheck HTTP
- restart policy `ON_FAILURE`

Esto encaja mejor con un bot de Discord que no expone una API web.  
Fuente oficial del esquema: https://railway.com/railway.schema.json  
Y referencia de restart policy: https://docs.railway.com/deployments/restart-policy

## 10. Verificacion despues del deploy

Cuando Railway termine:

1. Abre los logs del servicio
2. Confirma que aparezca algo como:

```text
Conectado a MongoDB Atlas
Comandos slash sincronizados correctamente...
Bot en línea como ...
```

3. En Discord prueba:
   - `/panel_taxi`
   - `Iniciar turno`
   - registrar carrera
   - adjuntar screenshot
   - finalizar turno

## 11. Problemas comunes

### Error conectando a MongoDB

- URI mal formada
- password sin escapar
- IP no permitida en Atlas
- usuario sin permisos

### El deploy arranca y luego cae

- falta `DISCORD_TOKEN`
- falta `MONGODB_URI`
- Railway reinicio el proceso por error de arranque
- limite de restarts del plan gratis

### No aparecen slash commands

- `CLIENT_ID` incorrecto
- `GUILD_ID` incorrecto
- `SYNC_COMMANDS_ON_STARTUP=false`
- bot sin permisos en el servidor

## 12. Comandos utiles con Railway CLI

Si luego quieres usar CLI:

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway logs
railway service restart
```

Fuentes oficiales:

- `railway up`: https://docs.railway.com/cli/deploying
- `railway init`: https://docs.railway.com/cli/init
- `railway service`: https://docs.railway.com/cli/service

## 13. Recomendacion final

Para este bot deja estas variables asi:

```env
SYNC_COMMANDS_ON_STARTUP=true
COMMAND_SCOPE=guild
```

Y usa roles por ID en vez de nombres para evitar errores cuando cambien nombres de roles en Discord.
