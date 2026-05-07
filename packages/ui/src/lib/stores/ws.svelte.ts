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
    // Styled console log for pipeline events
    this.logPipelineEvent(type, payload);

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

  private logPipelineEvent(type: string, payload: unknown): void {
    const p = payload as Record<string, unknown> | undefined;
    const taskId = (p?.taskId as string)?.slice(0, 8)?.toUpperCase() ?? '';
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Color styles for different event types
    const styles: Record<string, string> = {
      'pipeline:': 'color: #a78bfa; font-weight: bold',     // purple
      'agent:start': 'color: #60a5fa; font-weight: bold',   // blue
      'agent:complete': 'color: #34d399; font-weight: bold', // green
      'agent:error': 'color: #f87171; font-weight: bold',   // red
      'agent:stream': 'color: #9ca3af',                     // gray (quiet)
      'task:created': 'color: #fbbf24; font-weight: bold',  // yellow
      'task:updated': 'color: #fbbf24',                     // yellow
      'task:status': 'color: #f472b6; font-weight: bold',   // pink
      'task:deleted': 'color: #f87171',                     // red
    };

    // Find matching style
    let style = 'color: #9ca3af';
    for (const [prefix, s] of Object.entries(styles)) {
      if (type.startsWith(prefix) || type.includes(prefix.replace(':', ''))) {
        style = s;
        break;
      }
    }

    // Skip noisy streaming events from cluttering console
    if (type === 'agent:streaming' || type === 'agent:stream') return;

    // Format based on event type
    if (type.includes('agent:start')) {
      const agentType = (p?.type as string) ?? (p?.agentType as string) ?? '';
      console.log(
        `%c[${time}] %c[PIPELINE] %c${agentType.toUpperCase()} started %c${taskId}`,
        'color: #6b7280', style, 'color: #60a5fa; font-weight: bold', 'color: #6b7280'
      );
    } else if (type.includes('agent:complete')) {
      const agentType = (p?.type as string) ?? (p?.agentType as string) ?? '';
      console.log(
        `%c[${time}] %c[PIPELINE] %c${agentType.toUpperCase()} completed %c${taskId}`,
        'color: #6b7280', style, 'color: #34d399; font-weight: bold', 'color: #6b7280'
      );
    } else if (type.includes('agent:error')) {
      const error = (p?.error as string) ?? 'Unknown error';
      const agentType = (p?.type as string) ?? '';
      console.log(
        `%c[${time}] %c[PIPELINE] %c${agentType.toUpperCase()} FAILED %c${taskId}\n%c  Error: ${error}`,
        'color: #6b7280', style, 'color: #f87171; font-weight: bold', 'color: #6b7280', 'color: #f87171'
      );
    } else if (type === 'task:created') {
      const title = (p as any)?.title ?? '';
      console.log(
        `%c[${time}] %c[TASK] %cCreated: ${title}`,
        'color: #6b7280', style, 'color: #fbbf24'
      );
    } else if (type.includes('status')) {
      const from = (p?.from as string) ?? '';
      const to = (p?.to as string) ?? '';
      console.log(
        `%c[${time}] %c[TASK] %c${taskId} %c${from} → ${to}`,
        'color: #6b7280', style, 'color: #f472b6; font-weight: bold', 'color: #e5e7eb'
      );
    } else if (type === 'task:updated') {
      // Quiet - just a refresh signal
    } else {
      console.log(
        `%c[${time}] %c[WS] %c${type} %c${taskId}`,
        'color: #6b7280', 'color: #9ca3af', style, 'color: #6b7280'
      );
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
