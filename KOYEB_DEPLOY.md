# Deploy en Koyeb + MongoDB Atlas

Nota: el flujo recomendado actual de este repositorio ya no es Koyeb. Usa Railway salvo que quieras volver a esa alternativa.

Este proyecto esta preparado para desplegarse en Koyeb como `Worker`, no como `Web Service`.

## 1. Antes de subir el repositorio

- No subas `.env`
- Rota las credenciales si ya estuvieron expuestas:
  - `DISCORD_TOKEN`
  - usuario o password de MongoDB Atlas

## 2. Repo recomendado

Sube estos archivos:

- `index.js`
- `package.json`
- `package-lock.json`
- `src/`
- `.gitignore`
- `.env.example`
- `KOYEB_DEPLOY.md`

No subas:

- `.env`
- `logs/`
- dumps o backups

## 3. Preparar MongoDB Atlas

En Atlas:

1. Crea un usuario de base de datos exclusivo para produccion.
2. Crea o usa una base como `taxi-bot-prod`.
3. En `Network Access`, permite acceso desde Koyeb.

Opciones:

- Rapida: `0.0.0.0/0`
  - Menos segura, pero simple para arrancar.
- Mejor: limitar por IPs de salida si luego tu plan o arquitectura lo permite.

URI recomendada:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/taxi-bot-prod?retryWrites=true&w=majority
```

No uses `<PASSWORD>` ni `< >` en la URI final.

## 4. Crear el repositorio GitHub

Comandos:

```bash
git init
git add .
git commit -m "Prepare bot for Koyeb deployment"
```

Luego crea el repo en GitHub y haz push.

## 5. Crear el servicio en Koyeb

En Koyeb:

1. Crea una cuenta.
2. Conecta tu cuenta de GitHub.
3. `Create App`
4. Elige `GitHub`
5. Selecciona este repositorio
6. Crea un `Worker`

Configuracion recomendada:

- Service type: `Worker`
- Runtime: autodetectado por Node.js
- Build command: dejar vacio
- Run command: `npm start`
- Branch: `main`
- Instance: `Free`
- Auto deploy: activado

No expongas puertos. Este bot no necesita puerto publico en Koyeb porque es un proceso de fondo.

## 6. Variables de entorno en Koyeb

Carga estas variables en el panel de Koyeb:

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

Si no usas IDs de roles, puedes usar nombres:

```env
ROLE_TAXISTA=Taxista
ROLE_SUPERVISOR=Supervisor
ROLE_DUENO=Dueño
```

Los IDs son mas recomendables en produccion.

## 7. Despliegue de slash commands

El bot puede sincronizar comandos automaticamente al arrancar con:

```env
SYNC_COMMANDS_ON_STARTUP=true
COMMAND_SCOPE=guild
```

Usa `guild` para reflejar cambios rapido.

Si luego quieres comandos globales:

```env
COMMAND_SCOPE=global
```

Ten en cuenta que los comandos globales pueden tardar mas en propagarse.

## 8. Configuracion de Discord Developer Portal

En tu aplicacion del bot:

1. Ve a `Bot`
2. Activa:
   - `Server Members Intent` si luego lo necesitas
   - `Message Content Intent`

`Message Content Intent` es importante para el flujo de screenshots y mensajes en canales de turno.

## 9. Verificacion despues del deploy

Cuando el Worker quede `Healthy`:

1. Revisa logs en Koyeb
2. Confirma que aparezca:

```text
Conectado a MongoDB Atlas
Bot en línea como ...
Comandos slash sincronizados correctamente...
```

3. En Discord prueba:
   - `/panel_taxi`
   - `Iniciar turno`
   - canal privado
   - registrar carrera
   - adjuntar screenshot
   - finalizar turno

## 10. Problemas comunes

### Error de MongoDB

- URI mal formada
- password sin escapar si contiene caracteres especiales
- IP no permitida en Atlas

### Bot inicia pero no responde comandos

- `CLIENT_ID` incorrecto
- `GUILD_ID` incorrecto
- `SYNC_COMMANDS_ON_STARTUP=false`
- permisos faltantes del bot en Discord

### El bot no puede escribir en canales

Revisa permisos del rol del bot:

- View Channels
- Send Messages
- Manage Channels
- Manage Roles
- Attach Files
- Read Message History

## 11. Modo recomendado para este proyecto

Para este bot, deja:

```env
SYNC_COMMANDS_ON_STARTUP=true
COMMAND_SCOPE=guild
```

Asi cada deploy en Koyeb deja el bot listo sin ejecutar pasos manuales.
