export type EventHandler<E = Event> = (event: E) => void;

export const preventDefault =
	<E extends Event = Event>(fn: EventHandler<E>): EventHandler<E> =>
	(event) => {
		event.preventDefault();
		fn(event);
	};

export const stopPropagation =
	<E extends Event = Event>(fn: EventHandler<E>): EventHandler<E> =>
	(event) => {
		event.stopPropagation();
		fn(event);
	};

export const stopImmediatePropagation =
	<E extends Event = Event>(fn: EventHandler<E>): EventHandler<E> =>
	(event) => {
		event.stopImmediatePropagation();
		fn(event);
	};

export const once = <E extends Event = Event>(fn: EventHandler<E>): EventHandler<E> => {
	let called = false;
	return (event) => {
		if (!called) {
			called = true;
			fn(event);
		}
	};
};

export const compose =
	<E extends Event = Event>(...wrappers: Array<(fn: EventHandler<E>) => EventHandler<E>>) =>
	(fn: EventHandler<E>) =>
		wrappers.reduce((acc, wrap) => wrap(acc), fn);
