import { getEventType, type EventBus } from '../eventBus/EventBus.js';

export class Eventable<TEventMap extends object> {
	protected constructor(protected readonly eventBus?: EventBus<TEventMap>) {
		if (eventBus) {
			return new Proxy(this, {
				get: (target, prop, receiver) => {
					const original = Reflect.get(target, prop, receiver);

					if (typeof original !== 'function') {
						return original;
					}

					const eventType = getEventType(original as TypedPropertyDescriptor<unknown>);
					if (!eventType) {
						return original.bind(target);
					}

					return async (...args: unknown[]) => {
						const result = await original.apply(target, args);
						eventBus.publish(eventType as keyof TEventMap, result);
						return result;
					};
				}
			});
		}
	}
}
