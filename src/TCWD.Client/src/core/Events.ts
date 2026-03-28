type EventCallback = (...args: unknown[]) => void;

export class Events {
	private listeners = new Map<string, EventCallback[]>();

	on(event: string, callback: EventCallback): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event)!.push(callback);
	}

	off(event: string, callback: EventCallback): void {
		const cbs = this.listeners.get(event);
		if (!cbs) return;
		this.listeners.set(event, cbs.filter(cb => cb !== callback));
	}

	emit(event: string, ...args: unknown[]): void {
		const cbs = this.listeners.get(event);
		if (!cbs) return;
		for (const cb of cbs) {
			cb(...args);
		}
	}

	once(event: string, callback: EventCallback): void {
		const wrapper: EventCallback = (...args) => {
			this.off(event, wrapper);
			callback(...args);
		};
		this.on(event, wrapper);
	}

	clear(): void {
		this.listeners.clear();
	}
}

export const events = new Events();
