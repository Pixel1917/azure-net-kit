export interface IEvent<T = unknown> {
	aggregateId: string;
	eventType: string;
	eventVersion: number;
	occurredAt: Date;
	metadata: IEventMetadata;
	busName?: string;
	payload: T;
}

export interface IEventMetadata {
	userId?: string;
	correlationId: string;
	causationId?: string;
	sessionId?: string;
	[key: string]: unknown;
}

export type DomainEventHandler<T = unknown> = (event: IEvent<T>) => void | Promise<void>;

export interface IEventSubscription {
	unsubscribe(): void;
}

export class EventBus<TEventMap extends object> {
	private handlers = new Map<keyof TEventMap, Set<DomainEventHandler>>();
	private wildcardHandlers = new Set<DomainEventHandler>();
	private middleware: Array<(event: IEvent, next: () => Promise<void>) => Promise<void>> = [];
	private eventQueue: Array<{ event: IEvent; handlers: Set<DomainEventHandler> }> = [];
	private isProcessing = false;
	private eventHistory: IEvent[] = [];
	private priorities = new Map<keyof TEventMap, number>();
	private readonly debug: boolean = false;
	private readonly maxHistorySize: number = 1000;
	private readonly busName?: string;

	constructor(
		private options: {
			busName?: string;
			enableHistory?: boolean;
			maxHistorySize?: number;
			enableAsyncProcessing?: boolean;
			debug?: boolean;
		} = { debug: false }
	) {
		this.busName = options.busName ?? undefined;
		this.debug = options.debug ?? false;
		if (options.maxHistorySize) {
			this.maxHistorySize = options.maxHistorySize;
		}
	}

	publish<K extends keyof TEventMap>(eventType: K, payload: TEventMap[K], metadata?: Partial<IEventMetadata>): void {
		const event: IEvent<TEventMap[K]> = {
			aggregateId: this.generateAggregateId(String(eventType), payload),
			eventType: String(eventType),
			eventVersion: 1,
			occurredAt: new Date(),
			metadata: {
				correlationId: this.generateCorrelationId(),
				...metadata
			},
			busName: this.busName,
			payload
		};

		void this.processEvent(event);
	}

	publishBatch<K extends keyof TEventMap>(events: Array<{ type: K; payload: TEventMap[K]; metadata?: Partial<IEventMetadata> }>): void {
		const domainEvents = events.map(({ type, payload, metadata }) => ({
			aggregateId: this.generateAggregateId(type as string, payload),
			eventType: type as string,
			eventVersion: 1,
			occurredAt: new Date(),
			busName: this.busName,
			metadata: {
				correlationId: this.generateCorrelationId(),
				...metadata
			},
			payload
		}));

		domainEvents.forEach((event) => this.processEvent(event));
	}

	subscribe<K extends keyof TEventMap>(eventType: K, handler: DomainEventHandler<TEventMap[K]>, options?: { priority?: number }): IEventSubscription {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, new Set());
		}

		const handlers = this.handlers.get(eventType)!;
		handlers.add(handler as DomainEventHandler);

		if (options?.priority !== undefined) {
			this.priorities.set(eventType, options.priority);
		}

		return {
			unsubscribe: () => {
				handlers.delete(handler as DomainEventHandler);
				if (handlers.size === 0) {
					this.handlers.delete(eventType);
					this.priorities.delete(eventType);
				}
			}
		};
	}

	subscribeMany<K extends keyof TEventMap>(eventTypes: K[], handler: DomainEventHandler<TEventMap[K]>): IEventSubscription {
		const subscriptions = eventTypes.map((type) => this.subscribe(type, handler));

		return {
			unsubscribe: () => {
				subscriptions.forEach((sub) => sub.unsubscribe());
			}
		};
	}

	subscribeAll(handler: DomainEventHandler): IEventSubscription {
		this.wildcardHandlers.add(handler);

		return {
			unsubscribe: () => {
				this.wildcardHandlers.delete(handler);
			}
		};
	}

	use(middleware: <T = unknown>(event: IEvent<T>, next: () => Promise<void>) => Promise<void>): void {
		this.middleware.push(middleware);
	}

	private async processEvent(event: IEvent): Promise<void> {
		if (this.options.enableHistory) {
			this.addToHistory(event);
		}

		const handlers = this.getHandlersForEvent(event);

		if (!this.debug && handlers.size === 0 && this.wildcardHandlers.size === 0) {
			return;
		}

		if (this.options.enableAsyncProcessing) {
			this.eventQueue.push({ event, handlers });
			if (!this.isProcessing) {
				void this.processQueue();
			}
			return;
		}

		await this.executeHandlers(event, handlers);
	}

	private async executeHandlers(event: IEvent, handlers: Set<DomainEventHandler<unknown>>): Promise<void> {
		const allHandlers = [...handlers, ...this.wildcardHandlers];

		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= index) {
				throw new Error('next() called multiple times');
			}

			index = i;

			if (i === this.middleware.length) {
				await Promise.all(allHandlers.map((handler) => this.safeExecuteHandler(handler, event)));
				return;
			}

			const middleware = this.middleware[i];
			await middleware(event, () => dispatch(i + 1));
		};

		await dispatch(0);
	}

	private async safeExecuteHandler(handler: DomainEventHandler, event: IEvent): Promise<void> {
		try {
			await handler(event);
		} catch (error) {
			console.error(`Error handling event ${event.eventType}:`, error);
		}
	}

	private getHandlersForEvent(event: IEvent): Set<DomainEventHandler> {
		const handlers = this.handlers.get(event.eventType as keyof TEventMap);
		return handlers || new Set();
	}

	private async processQueue(): Promise<void> {
		if (this.isProcessing || this.eventQueue.length === 0) {
			return;
		}

		this.isProcessing = true;

		this.eventQueue.sort((a, b) => {
			const priorityA = this.priorities.get(a.event.eventType as keyof TEventMap) || 0;
			const priorityB = this.priorities.get(b.event.eventType as keyof TEventMap) || 0;
			return priorityB - priorityA;
		});

		while (this.eventQueue.length > 0) {
			const batch = this.eventQueue.splice(0, 10);
			await Promise.all(batch.map(({ event, handlers }) => this.executeHandlers(event, handlers)));
		}

		this.isProcessing = false;
	}

	private addToHistory(event: IEvent): void {
		this.eventHistory.push(event);
		if (this.eventHistory.length > this.maxHistorySize) {
			this.eventHistory.shift();
		}
	}

	getHistory(filter?: { eventType?: keyof TEventMap; aggregateId?: string }): IEvent[] {
		if (!filter) return [...this.eventHistory];

		return this.eventHistory.filter((event) => {
			switch (true) {
				case filter.eventType && event.eventType !== filter.eventType:
					return false;
				case filter.aggregateId && event.aggregateId !== filter.aggregateId:
					return false;
				default:
					return true;
			}
		});
	}

	async waitForCompletion(): Promise<void> {
		while (this.isProcessing || this.eventQueue.length > 0) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	clear(): void {
		this.handlers.clear();
		this.wildcardHandlers.clear();
		this.eventQueue = [];
		this.eventHistory = [];
	}

	private generateAggregateId(eventType: string, payload: unknown): string {
		const maybeEventPayload = payload as { id?: string; aggregateId?: string };
		if (typeof maybeEventPayload === 'object' && maybeEventPayload?.id) return String(maybeEventPayload.id);
		if (typeof maybeEventPayload === 'object' && maybeEventPayload?.aggregateId) return String(maybeEventPayload.aggregateId);
		return `${eventType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	private generateCorrelationId(): string {
		return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}
}

export const loggingMiddleware = async (event: IEvent, next: () => Promise<void>) => {
	console.log(`[${event.busName ?? ''}Event] ${event.eventType} at ${event.occurredAt.toISOString()}`);
	console.log(`[${event.busName ?? ''}Event] data:`, event);
	const start = performance.now();
	await next();
	const duration = performance.now() - start;
	console.log(`[${event.busName ?? ''}Event] ${event.eventType} processed in ${duration.toFixed(2)}ms`);
};

export const createEventBus = <TEventMap extends object>(opts: {
	history?: boolean;
	asyncProcessing?: boolean;
	historySize?: number;
	middlewares?: (<T = unknown>(event: IEvent<T>, next: () => Promise<void>) => Promise<void>)[];
	debug?: boolean;
	busName?: string;
}) => {
	const { history = true, asyncProcessing = true, historySize = 1000, middlewares = [], debug = false } = opts;
	const eventBus = new EventBus<TEventMap>({
		busName: opts.busName,
		enableHistory: history,
		enableAsyncProcessing: asyncProcessing,
		maxHistorySize: historySize,
		debug
	});
	middlewares.forEach((value) => {
		eventBus.use(value);
	});

	const CreateEvent = <K extends keyof TEventMap>(eventName: K, data: TEventMap[K]) => {
		eventBus.publish(eventName, data);
	};

	const CreateBatch = <K extends keyof TEventMap>(events: Array<{ type: K; payload: TEventMap[K]; metadata?: Partial<IEventMetadata> }>) => {
		eventBus.publishBatch(events);
	};

	const CreateSubscriber = <K extends keyof TEventMap>(eventType: K, handler: DomainEventHandler<TEventMap[K]>, options?: { priority?: number }) => {
		return eventBus.subscribe(eventType, handler, options);
	};

	const CreateSubscribers = <K extends keyof TEventMap>(eventTypes: K[], handler: DomainEventHandler<TEventMap[K]>) => {
		return eventBus.subscribeMany(eventTypes, handler);
	};

	return { eventBus, CreateEvent, CreateBatch, CreateSubscriber, CreateSubscribers };
};
