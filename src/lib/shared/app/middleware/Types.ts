export interface IMiddleware<TContext, TResult = void> {
	execute(context: TContext): TResult;
}

export type MiddlewareClass<T> = new () => T;
