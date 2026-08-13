type MaybePromise<T> = T | PromiseLike<T>;
type WaitUntil = (promise: Promise<unknown>) => void;
type WaitUntilTarget = WaitUntil | { waitUntil: WaitUntil };

export class BackgroundTask<T = void> implements Promise<T> {
	readonly [Symbol.toStringTag] = 'Promise';
	readonly #promise: Promise<T>;

	private constructor(task: () => MaybePromise<T>) {
		try {
			this.#promise = Promise.resolve(task());
		} catch (error) {
			this.#promise = Promise.reject(error);
		}
		void this.#promise.catch(() => undefined);
	}

	static run<T = void>(task: () => MaybePromise<T>): BackgroundTask<T> {
		return new BackgroundTask(task);
	}

	waitUntil(target: WaitUntilTarget): this {
		if (typeof target === 'function') {
			target(this.#promise);
		} else {
			target.waitUntil(this.#promise);
		}

		return this;
	}

	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	): Promise<TResult1 | TResult2> {
		return this.#promise.then(onfulfilled, onrejected);
	}

	catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult> {
		return this.#promise.catch(onrejected);
	}

	finally(onfinally?: (() => void) | null): Promise<T> {
		return this.#promise.finally(onfinally);
	}
}
