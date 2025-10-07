import type { HttpServiceResponse } from '../httpService/index.js';

type DeepKeys<T> = T extends object
	? {
			[K in keyof T & string]: T[K] extends object ? K | `${K}.${DeepKeys<T[K]>}` : K;
		}[keyof T & string]
	: never;

// type DeepValue<T, Path extends string> = Path extends `${infer Key}.${infer Rest}`
// 	? Key extends keyof T
// 		? DeepValue<T[Key], Rest>
// 		: never
// 	: Path extends keyof T
// 		? T[Path]
// 		: never;

type ResponseBuilderState<TData, TMeta = unknown> = {
	data: TData;
	meta: TMeta;
};

type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

export class ResponseBuilder<TData = unknown, TMeta = object, TWrapper = TData> {
	protected state: ResponseBuilderState<TData, TMeta>;

	constructor(protected readonly response: HttpServiceResponse<TWrapper>) {
		this.state = {
			data: this.unwrapData(response.data),
			meta: {} as TMeta
		};
	}

	protected unwrapData(data: TWrapper): TData {
		return data as unknown as TData;
	}

	mapUsing<TResource>(ResourceClass: new (data: TData) => { toPlainObject(): TResource }): this {
		const resource = new ResourceClass(this.state.data);
		const newResponse = new (this.constructor as new (response: HttpServiceResponse<TWrapper>) => this)(this.response);
		newResponse.state = {
			...this.state,
			data: resource.toPlainObject() as unknown as TData
		};
		return newResponse;
	}

	mapCollectionUsing<TResource>(ResourceClass: new (data: ArrayElement<TData>) => { toPlainObject(): TResource }): this {
		if (!Array.isArray(this.state.data)) {
			throw new Error('toCollection can only be used when data is an array');
		}
		const collection = (this.state.data as ArrayElement<TData>[]).map((dataElement) => new ResourceClass(dataElement).toPlainObject());
		const newResponse = new (this.constructor as new (response: HttpServiceResponse<TWrapper>) => this)(this.response);
		newResponse.state = {
			...this.state,
			data: collection as unknown as TData
		};
		return newResponse;
	}

	extract<TPath extends DeepKeys<TData>>(path: TPath): this {
		const keys = path.split('.');
		let result: unknown = this.state.data;

		for (const key of keys) {
			if (result && typeof result === 'object' && key in result) {
				result = result[key as keyof typeof result];
			} else {
				throw new Error(`Path "${path}" not found in response data`);
			}
		}

		const newResponse = new (this.constructor as new (response: HttpServiceResponse<TWrapper>) => this)(this.response);
		newResponse.state = {
			...this.state,
			data: result as TData
		};
		return newResponse;
	}

	addMeta<TNewMeta extends Record<string, unknown>>(
		metaData: TNewMeta | ((current: TMeta) => TNewMeta)
	): Omit<this, keyof ResponseBuilder<unknown, unknown, unknown>> & ResponseBuilder<TData, TMeta & TNewMeta, TWrapper> {
		const newMeta = typeof metaData === 'function' ? metaData(this.state.meta) : metaData;

		const newResponse = new (this.constructor as typeof ResponseBuilder<unknown, unknown, unknown>)(this.response);
		newResponse.state = {
			...this.state,
			meta: { ...this.state.meta, ...newMeta } as TMeta & TNewMeta
		};
		return newResponse as Omit<this, keyof ResponseBuilder<unknown, unknown, unknown>> & ResponseBuilder<TData, TMeta & TNewMeta, TWrapper>;
	}

	getData() {
		return this.state.data;
	}

	get() {
		return {
			data: this.state.data,
			meta: this.state.meta
		};
	}

	getFlatten() {
		return {
			data: this.state.data,
			...this.state.meta
		};
	}

	getRaw() {
		return this.response;
	}
}
