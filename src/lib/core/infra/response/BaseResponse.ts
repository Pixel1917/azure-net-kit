import { HttpServiceResponse } from '$lib/core/index.js';

type DeepKeys<T> = T extends object
	? {
			[K in keyof T & string]: T[K] extends object ? K | `${K}.${DeepKeys<T[K]>}` : K;
		}[keyof T & string]
	: never;

type DeepValue<T, Path extends string> = Path extends `${infer Key}.${infer Rest}`
	? Key extends keyof T
		? DeepValue<T[Key], Rest>
		: never
	: Path extends keyof T
		? T[Path]
		: never;

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

	mapUsing<TResource>(ResourceClass: new (data: TData) => { toPlainObject(): TResource }): ResponseBuilder<TResource, TMeta, TWrapper> {
		const resource = new ResourceClass(this.state.data);
		const newResponse = new ResponseBuilder<TResource, TMeta, TWrapper>(this.response);
		newResponse.state = {
			...this.state,
			data: resource.toPlainObject()
		};
		return newResponse;
	}

	mapCollectionUsing<TResource>(
		ResourceClass: new (data: ArrayElement<TData>) => { toPlainObject(): TResource }
	): ResponseBuilder<TResource[], TMeta, TWrapper> {
		if (!Array.isArray(this.state.data)) {
			throw new Error('toCollection can only be used when data is an array');
		}
		const collection = (this.state.data as ArrayElement<TData>[]).map((dataElement) => new ResourceClass(dataElement).toPlainObject());
		const newResponse = new ResponseBuilder<TResource[], TMeta, TWrapper>(this.response);
		newResponse.state = {
			...this.state,
			data: collection
		};
		return newResponse;
	}

	extract<TPath extends DeepKeys<TData>>(path: TPath): ResponseBuilder<DeepValue<TData, TPath>, TMeta, TWrapper> {
		const keys = path.split('.');
		let result: unknown = this.state.data;

		for (const key of keys) {
			if (result && typeof result === 'object' && key in result) {
				result = result[key as keyof typeof result];
			} else {
				throw new Error(`Path "${path}" not found in response data`);
			}
		}

		const newResponse = new ResponseBuilder<DeepValue<TData, TPath>, TMeta, TWrapper>(this.response);
		newResponse.state = {
			...this.state,
			data: result as DeepValue<TData, TPath>
		};
		return newResponse;
	}

	addMeta<TNewMeta extends Record<string, unknown>>(
		metaData: TNewMeta | ((current: TMeta) => TNewMeta)
	): ResponseBuilder<TData, TMeta & TNewMeta, TWrapper> {
		const newMeta = typeof metaData === 'function' ? metaData(this.state.meta) : metaData;

		const newResponse = new ResponseBuilder<TData, TMeta & TNewMeta, TWrapper>(this.response);
		newResponse.state = {
			...this.state,
			meta: { ...this.state.meta, ...newMeta } as TMeta & TNewMeta
		};
		return newResponse;
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
