import { HttpService, HttpServiceError, HttpServiceResponse } from '../httpService/HttpService.js';
import { QueryBuilder } from '../query/index.js';

export type CreateRequestCallbackType<T> = (params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<T>>;

export class BaseHttpDatasource<TQueryBuilder extends QueryBuilder = QueryBuilder> {
	protected readonly httpClient: HttpService;
	protected readonly query: QueryBuilder;

	constructor(params: { http?: HttpService; query?: TQueryBuilder }) {
		this.httpClient = params.http ?? new HttpService({ baseUrl: '' });
		this.query = params.query ?? new QueryBuilder();
	}

	private async _createRawRequest<T>(callback: CreateRequestCallbackType<T>): Promise<HttpServiceResponse<T>> {
		return await callback({ http: this.httpClient, query: this.query }).catch((err: HttpServiceError<unknown>) => {
			throw err;
		});
	}

	public readonly createRawRequest = this._createRawRequest.bind(this);
}
