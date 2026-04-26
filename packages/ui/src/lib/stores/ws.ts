import type { WSMessage } from '../types/index.js';

type EventHandler = (payload: any) => void;

class WebSocketStore {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private _connected = $state(false);

  get connected() {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectAttempts = 0;
        console.log('[WS] Connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.dispatch(message.type, message.payload);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        console.log('[WS] Disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._connected = false;
        console.error('[WS] Error');
      };
    } catch (err) {
      console.error('[WS] Failed to connect:', err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  send(type: string, payload?: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send');
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  private dispatch(type: string, payload: unknown): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[WS] Handler error for ${type}:`, err);
        }
      }
    }

    // Also dispatch to wildcard listeners
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler({ type, payload });
        } catch (err) {
          console.error('[WS] Wildcard handler error:', err);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

export const wsStore = new WebSocketStore();
