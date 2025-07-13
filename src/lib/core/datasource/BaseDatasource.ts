import { HttpService, HttpServiceError, HttpServiceResponse } from '../httpService/HttpService.js';
import { QueryBuilder } from '../query/index.js';

export interface IHttpDatasource {
	/**
	 * Executes a wrapped HTTP request and handles the response.
	 *
	 * @param callback - A function that receives the HttpService and QueryBuilder. Returns a Promise of a response.
	 * @returns A typed HTTP response wrapped in a Promise.
	 */
	createRequest<T>(
		callback: <J = T>(params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<J>>
	): Promise<HttpServiceResponse<T>>;
}

export class BaseHttpDatasource implements IHttpDatasource {
	protected readonly httpClient: HttpService;
	protected readonly query: QueryBuilder;

	constructor(params: { http?: HttpService; query?: QueryBuilder }) {
		this.httpClient = params.http ?? new HttpService({ baseUrl: '' });
		this.query = params.query ?? new QueryBuilder();
	}

	async createRequest<T>(
		callback: <J = T>(params: { http: HttpService; query: QueryBuilder }) => Promise<HttpServiceResponse<J>>
	): Promise<HttpServiceResponse<T>> {
		return await callback({ http: this.httpClient, query: this.query })
			.then((response) => <HttpServiceResponse<T>>response)
			.catch((err: HttpServiceError<unknown>) => {
				throw err;
			});
	}
}

export const createHttpDatasource = (params: { http?: HttpService; query?: QueryBuilder }) => {
	return new BaseHttpDatasource(params);
};
