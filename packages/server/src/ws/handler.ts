import type { WSContext } from "hono/ws";
import type { Orchestrator, OrchestratorEvents } from "@ai-coder/core";
import { createWSMessage } from "./events.js";

interface ConnectedClient {
  ws: WSContext;
  projectId: string | null;
}

export class WebSocketHandler {
  private clients: Set<ConnectedClient> = new Set();

  constructor(private orchestrator: Orchestrator) {
    this.setupOrchestratorEvents();
  }

  /**
   * Handle new WebSocket connection
   */
  onOpen(ws: WSContext): void {
    const client: ConnectedClient = { ws, projectId: null };
    this.clients.add(client);
    console.log(`[WS] Client connected. Total: ${this.clients.size}`);
  }

  /**
   * Handle incoming WebSocket message
   */
  onMessage(ws: WSContext, data: string): void {
    try {
      const message = JSON.parse(data);
      const client = this.findClient(ws);
      if (!client) return;

      switch (message.type) {
        case "subscribe":
          client.projectId = message.payload?.projectId || null;
          console.log(
            `[WS] Client subscribed to project: ${client.projectId}`
          );
          break;

        case "unsubscribe":
          client.projectId = null;
          console.log("[WS] Client unsubscribed");
          break;

        default:
          console.log(`[WS] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("[WS] Failed to parse message:", error);
    }
  }

  /**
   * Handle WebSocket close
   */
  onClose(ws: WSContext): void {
    const client = this.findClient(ws);
    if (client) {
      this.clients.delete(client);
    }
    console.log(`[WS] Client disconnected. Total: ${this.clients.size}`);
  }

  /**
   * Handle WebSocket error
   */
  onError(ws: WSContext, _error: Event): void {
    console.error("[WS] Error occurred");
    const client = this.findClient(ws);
    if (client) {
      this.clients.delete(client);
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(type: string, payload: unknown): void {
    const message = createWSMessage(type, payload);
    for (const client of this.clients) {
      try {
        client.ws.send(message);
      } catch {
        // Client might be disconnected
        this.clients.delete(client);
      }
    }
  }

  /**
   * Send message to clients subscribed to a specific project
   */
  broadcastToProject(
    projectId: string,
    type: string,
    payload: unknown
  ): void {
    const message = createWSMessage(type, payload);
    for (const client of this.clients) {
      if (client.projectId === projectId || client.projectId === null) {
        try {
          client.ws.send(message);
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }

  private findClient(ws: WSContext): ConnectedClient | undefined {
    for (const client of this.clients) {
      if (client.ws === ws) return client;
    }
    return undefined;
  }

  /**
   * Wire up orchestrator events to WebSocket broadcasts.
   * Uses the actual OrchestratorEvents interface from core.
   */
  private setupOrchestratorEvents(): void {
    // Pipeline events
    this.orchestrator.on("pipeline:start", (taskId) => {
      this.broadcast("pipeline:start", { taskId });
    });
    this.orchestrator.on("pipeline:stage", (taskId, stage) => {
      this.broadcast("pipeline:stage", { taskId, stage });
    });
    this.orchestrator.on("pipeline:complete", (taskId) => {
      this.broadcast("pipeline:complete", { taskId });
    });
    this.orchestrator.on("pipeline:error", (taskId, error) => {
      this.broadcast("pipeline:error", { taskId, error: error.message });
    });

    // Agent events
    this.orchestrator.on("agent:start", (taskId, agentType) => {
      this.broadcast("agent:start", { taskId, agentType });
    });
    this.orchestrator.on("agent:stream", (taskId, agentType, chunk) => {
      this.broadcast("agent:stream", { taskId, agentType, chunk });
    });
    this.orchestrator.on("agent:complete", (taskId, agentType) => {
      this.broadcast("agent:complete", { taskId, agentType });
    });
    this.orchestrator.on("agent:error", (taskId, agentType, error) => {
      this.broadcast("agent:error", { taskId, agentType, error: error.message });
    });

    // Task events
    this.orchestrator.on("task:created", (task) => {
      this.broadcast("task:created", { task });
    });
    this.orchestrator.on("task:updated", (task) => {
      this.broadcast("task:updated", { task });
    });
    this.orchestrator.on("task:statusChanged", (task, oldStatus, newStatus) => {
      this.broadcast("task:statusChanged", { task, oldStatus, newStatus });
    });

    // Planning events
    this.orchestrator.on("plan:created", (taskId, result) => {
      this.broadcast("plan:created", { taskId, result });
    });

    // Coding events
    this.orchestrator.on("code:generated", (taskId, result) => {
      this.broadcast("code:generated", { taskId, result });
    });
    this.orchestrator.on("code:applied", (taskId, filesChanged) => {
      this.broadcast("code:applied", { taskId, filesChanged });
    });

    // Review events
    this.orchestrator.on("review:completed", (taskId, result) => {
      this.broadcast("review:completed", { taskId, result });
    });

    // Git events
    this.orchestrator.on("git:committed", (taskId, hash, message) => {
      this.broadcast("git:committed", { taskId, hash, message });
    });
    this.orchestrator.on("git:pushed", (taskId, branch) => {
      this.broadcast("git:pushed", { taskId, branch });
    });
  }
}
