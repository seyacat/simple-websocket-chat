// happy-dom no expone WebSocket global. El código del cliente usa WebSocket.OPEN
// como constante; un polyfill mínimo es suficiente para los tests unitarios
// (los tests no abren sockets reales — usan un fake con readyState = 1).
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
  }
}
