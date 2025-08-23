export type EventHandler<E = Event> = (event: E) => void;

interface EventModifier<E extends Event = Event> {
	(fn: () => void): EventHandler<E>;
	prevent: EventModifier<E>;
	stop: EventModifier<E>;
	immediate: EventModifier<E>;
	once: EventModifier<E>;
	preventDefault: EventModifier<E>;
	stopPropagation: EventModifier<E>;
	stopImmediatePropagation: EventModifier<E>;
}

const createEventModifier = <E extends Event = Event>(modifiers = new Set<string>()): EventModifier<E> => {
	return new Proxy(() => {}, {
		get(_, prop: string) {
			return createEventModifier<E>(new Set([...modifiers, prop]));
		},
		apply(_, __, [fn]: [() => void]): EventHandler<E> {
			let executed = false;

			return (event: E) => {
				if (modifiers.has('once') && executed) return;

				if (modifiers.has('prevent') || modifiers.has('preventDefault')) {
					event.preventDefault();
				}
				if (modifiers.has('stop') || modifiers.has('stopPropagation')) {
					event.stopPropagation();
				}
				if (modifiers.has('immediate') || modifiers.has('stopImmediatePropagation')) {
					event.stopImmediatePropagation();
				}

				if (modifiers.has('once')) executed = true;

				fn();
			};
		}
	}) as unknown as EventModifier<E>;
};

export const prevent = createEventModifier(new Set(['prevent']));
export const stop = createEventModifier(new Set(['stop']));
export const immediate = createEventModifier(new Set(['immediate']));
export const once = createEventModifier(new Set(['once']));
export const event = createEventModifier();
