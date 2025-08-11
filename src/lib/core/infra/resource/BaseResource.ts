export type PlainObject<T> = {
	[K in keyof T as K extends string ? (T[K] extends (...args: unknown[]) => unknown ? never : K) : never]: T[K];
};

export interface IDTOMapper<TOutput = never> {
	toPlainObject(): [TOutput] extends [never] ? PlainObject<this> : TOutput;
}

export type Collection<T> = T[];

export class DTOMapper<TOutput = never> implements IDTOMapper<TOutput> {
	toPlainObject(): [TOutput] extends [never] ? PlainObject<this> : TOutput {
		return { ...this } as unknown as [TOutput] extends [never] ? PlainObject<this> : TOutput;
	}
}
