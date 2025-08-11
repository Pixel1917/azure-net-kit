export type IResource<T> = {
	[K in keyof T as K extends string ? (T[K] extends (...args: unknown[]) => unknown ? never : K) : never]: T[K];
};

export interface IBaseResource {
	toPlainObject(): IResource<this>;
}

export type Collection<T> = IResource<T>[];

export class Resource implements IBaseResource {
	toPlainObject(): IResource<this> {
		return { ...this } as IResource<this>;
	}
}
