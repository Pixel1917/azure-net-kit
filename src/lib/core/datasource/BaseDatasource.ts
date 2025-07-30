import { HttpService, HttpServiceError, HttpServiceResponse } from '../httpService/HttpService.js';
import { QueryBuilder } from '../query/index.js';

type ApplyWrapper<TWrapper, T, TDataKey extends keyof TWrapper> =
	TWrapper extends Record<TDataKey, unknown> ? Omit<TWrapper, TDataKey> & { [K in TDataKey]: T } : T;

export interface IHttpDatasource<TWrapper = never, TDataKey extends keyof TWrapper = never> {
	createRequest<T>(
		callback: <J = ApplyWrapper<TWrapper, T, TDataKey>>(params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<J>>
	): Promise<HttpServiceResponse<ApplyWrapper<TWrapper, T, TDataKey>>>;

	createRawRequest<T>(
		callback: (params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<T>>
	): Promise<HttpServiceResponse<T>>;
}

export class BaseHttpDatasource<TWrapper = never, TDataKey extends keyof TWrapper = never> implements IHttpDatasource<TWrapper, TDataKey> {
	protected readonly httpClient: HttpService;
	protected readonly query: QueryBuilder;

	constructor(params: { http?: HttpService; query?: QueryBuilder }) {
		this.httpClient = params.http ?? new HttpService({ baseUrl: '' });
		this.query = params.query ?? new QueryBuilder();
	}

	async createRequest<T>(
		callback: <J = ApplyWrapper<TWrapper, T, TDataKey>>(params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<J>>
	): Promise<HttpServiceResponse<ApplyWrapper<TWrapper, T, TDataKey>>> {
		return await callback({ http: this.httpClient, query: this.query })
			.then((response) => response as HttpServiceResponse<ApplyWrapper<TWrapper, T, TDataKey>>)
			.catch((err: HttpServiceError<unknown>) => {
				throw err;
			});
	}

	private async _createRawRequest<T>(
		callback: (params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<T>>
	): Promise<HttpServiceResponse<T>> {
		return await callback({ http: this.httpClient, query: this.query }).catch((err: HttpServiceError<unknown>) => {
			throw err;
		});
	}

	public readonly createRawRequest = this._createRawRequest.bind(this);
}
