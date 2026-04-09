# IRC Chat - simple-websocket-chat

A peer-to-peer IRC-like chat application built with Vue 3 + Vite, using the WebSocket proxy server at `wss://closer.click:4000`.

## 🌐 Live Demo

**https://seyacat.github.io/Simple-websocket/simple-websocket-chat/**

## Features

- **Real-time messaging** - Send and receive messages in public chat rooms
- **Room browsing** - Browse available rooms or create your own
- **Member list** - See who's connected in the current room
- **Heartbeat protocol** - Keep connections alive and detect stale members
- **Dark mode** - Auto-respects system theme preference
- **Offline detection** - Stale members marked as offline (3+ min no heartbeat)

## Getting Started

### Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5174`

### Production Build

```bash
npm run build
npm run preview
```

### Environment

Configure the WebSocket server URL in `.env`:

```
VITE_WS_URL=wss://closer.click:4000
```

For local development, use:
```
VITE_WS_URL=ws://localhost:4001
```

## Architecture

### Peer-to-Peer Mesh

No central host per room. All members are equal peers:

1. **Join room** → Publish token to `chat_room_<name>` channel
2. **Send message** → Query channel for member tokens, send to all
3. **Leave room** → Unpublish from channel
4. **Heartbeat** → Every 30s keep-alive to maintain channel registration
5. **Member refresh** → Every 60s query channel to detect departures

### Message Protocol

Wire format: `TYPE|JSON_PAYLOAD`

| Type | Direction | Purpose |
|------|-----------|---------|
| `CHAT_MSG` | peer → peers | Chat message |
| `JOIN_ANNOUNCE` | newcomer → existing | "I just joined" |
| `LEAVE_ANNOUNCE` | leaver → peers | "I'm leaving" |
| `HEARTBEAT` | all → all | Keep-alive (30s interval) |
| `HEARTBEAT_ACK` | reply to JOIN_ANNOUNCE | Confirm existence |

### Stores (Pinia)

- **connectionStore** - WebSocket lifecycle, token, nickname
- **roomStore** - Room state, messages, members, protocol handlers

### Components

- **NicknameModal** - Overlay to set nickname (blocks UI)
- **ConnectionStatus** - Top bar with connection dot + token + nickname
- **RoomList** - Left sidebar: browse/create rooms
- **ChatRoom** - Center: message list + input
- **MemberList** - Right sidebar: members with online status

## Project Structure

```
src/
  main.js
  App.vue
  style.css / style/theme.css     Global CSS
  services/
    WebSocketProxyClient.js        WebSocket client singleton
  stores/
    connectionStore.js             Connection + WebSocket mgmt
    roomStore.js                   Chat protocol + room state
  components/
    NicknameModal.vue
    ConnectionStatus.vue
    RoomList.vue
    ChatRoom.vue
    MemberList.vue
```

## Deployment

GitHub Actions workflow deploys to GitHub Pages on pushes to `main` (in `simple-websocket-chat/` subdirectory).

```yaml
# Triggered when simple-websocket-chat/* changes
- name: Build
  run: cd simple-websocket-chat && npm run build
```

## Key Design Decisions

1. **No host model** - Simplifies room lifecycle (no "host closed room" scenario)
2. **Optimistic echo** - Own messages appear immediately without server echo
3. **Heartbeat + channel refresh** - Dual strategy ensures member list accuracy
4. **JOIN_ANNOUNCE → HEARTBEAT_ACK** - Solves bootstrap: newcomer gets all nicknames

## Troubleshooting

### "WebSocket not connected"
- Check connection status in top bar (green dot = connected)
- Network tab: verify WebSocket to `closer.click:4000` succeeds
- Check browser console for errors

### Messages not sending
- Verify you're in a room (center panel shows messages)
- Check that other members exist (member list > 1)
- Look for error messages below the input

### Room disappears
- If all members leave or TTL expires (20 min), room ceases to exist
- All members must actively maintain channel registration via heartbeat
- Refresh the room list to update member counts

## License

MIT
