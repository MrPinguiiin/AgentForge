export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface WSClientMessage {
  type: "subscribe" | "unsubscribe";
  payload: {
    projectId: string;
  };
}

export function createWSMessage(type: string, payload: unknown): string {
  return JSON.stringify({
    type,
    payload,
    timestamp: Date.now(),
  } satisfies WSMessage);
}
