export interface EventBus<Event> {
  publish(event: Event): Promise<void>;
  subscribe(listener: (event: Event) => void): () => void;
}
