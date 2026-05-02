# Closer Click Chat

Aplicación de chat multi-sala P2P-mesh sobre el proxy WebSocket de Closer Click. Vue 3 + Vite + Pinia.

🌐 Producción: **https://seyacat.github.io/simple-websocket-chat/**

## Características

- **Salas públicas** auto-descubiertas a través de `list_channels` con prefijo.
- **Sin host por sala**: todos los miembros son peers iguales, publicados en `chat_room_<nombre>`.
- **Real-time**: el proxy emite `joined` / `left` / `disconnected` a los miembros del canal.
- **Identidad cross-app** vía vault (mismo keypair en chat, chess, etc.).
- **Reputación firmada** con web of trust: ratings firmados con ECDSA P-256 que se intercambian automáticamente entre peers de una sala.
- **Mobile responsive** con vistas single-pane intercambiables (rooms / chat / members).
- **Tema claro/oscuro** según preferencia del sistema.

## Stack y dependencias

```jsonc
{
  "@gatoseya/closer-click-proxy-client": "^0.1.1",
  "@gatoseya/closer-click-identity":     "^0.4.0",
  "vue": "^3", "pinia": "^3"
}
```

Las dos primeras son las librerías de Closer Click publicadas en npm. Ver su documentación para detalles.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173/simple-websocket-chat/
npm run build        # genera dist/
```

`.env`:

```
VITE_WS_URL=wss://proxy.closer.click   # default si no se setea
```

Para apuntar a un proxy local: `VITE_WS_URL=ws://localhost:4001`.

## Arquitectura

### Stores (Pinia)

- **`connectionStore`** — conexión al proxy, token corto, nickname local. Wrapper sobre `getWebSocketProxyClient()`.
- **`roomStore`** — estado de la sala actual: mensajes, miembros, handshake de identidad, intercambio de reputación. Map reactivo `trustMap` (mis ratings emitidos) para pesar endorsements.

### Protocolo de mensajes

Wire format: `TYPE|JSON_PAYLOAD` viajando como `message` dentro del envelope del proxy.

| Type | Dirección | Propósito |
|------|-----------|-----------|
| `CHAT_MSG` | peer → peers | Mensaje de chat |
| `JOIN_ANNOUNCE` | newcomer → existing | "Acabo de entrar" |
| `LEAVE_ANNOUNCE` | leaver → peers | "Me voy" |
| `HEARTBEAT` / `HEARTBEAT_ACK` | all → all | Mantener visibilidad |
| `IDENTIFY_CHALLENGE` | a un peer | Reto firmado para verificar identidad |
| `IDENTIFY_RESPONSE` | reply | Firma + pubkey |
| `RATING_QUERY` | broadcast en sala | "¿qué saben de este pubkey?" |
| `RATING_REPLY` | reply | Mi rating + endorsements firmadas |

### Web of trust

1. Tras unirse a una sala, cada peer recibe `JOIN_ANNOUNCE` y dispara un `IDENTIFY_CHALLENGE` al recién llegado.
2. El recién llegado responde con `IDENTIFY_RESPONSE` (firmado por su llave privada en el vault). El peer verifica.
3. Una vez verificado el pubkey, el peer dispara `RATING_QUERY` al resto del cuarto.
4. Cada respuesta trae `mine` (rating propio firmado) + `endorsements` (ratings firmados de terceros que ese peer haya recolectado).
5. El vault verifica todas las firmas, dedupea por `(ratedBy, subject)`, y guarda hasta 50 endorsements por subject.
6. **Display**: rating propio = ★ amarillo. Si no hay propio, se computa promedio ponderado donde el peso de cada endorser es `miRating(endorser) / 5`. Endorsers no calificados → peso 0 → ignorados. Resultado = ★ azul (derivado).

### Componentes

- `NicknameModal` — gate inicial.
- `ConnectionStatus` — header con dot de conexión, token, `@nickname` (click → `UserSettingsModal`).
- `UserSettingsModal` — editar nickname, ver pubkey, exportar/importar identidad (JSON).
- `RoomList` — sidebar de salas, crear/refrescar.
- `ChatRoom` — área central: mensajes, input.
- `MemberList` — sidebar de miembros con badge de rating; hover muestra rating, click abre `PeerRatingModal`.
- `PeerRatingModal` — calificación 0–5, notas, lista de endorsements firmadas (filtradas a peers que tú calificas), suspicion modifier.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) publica `dist/` en GitHub Pages al hacer push a `main`.

## Troubleshooting

| Síntoma | Diagnóstico |
|---------|-------------|
| "WebSocket not connected" | Verifica `wss://proxy.closer.click` desde DevTools → Network. |
| Identity vault unreachable | El vault vive en `id.closer.click`. Requiere HTTPS para `crypto.subtle`. |
| No aparece rating al hover | El handshake aún no completó (puede tardar ~1s). |
| "No puedes enviarte mensajes a ti mismo" | Bug menor que aparece a veces al refrescar — los mensajes siguen funcionando. |

## Licencia

MIT
