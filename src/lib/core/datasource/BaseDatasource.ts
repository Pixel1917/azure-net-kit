import { HttpService, HttpServiceError, HttpServiceResponse } from '../httpService/HttpService.js';

export interface IDatasource {
	/**
	 * Executes a wrapped HTTP request and handles the response.
	 *
	 * @param callback - A function that receives the HttpService and returns a Promise of a response.
	 * @returns A typed HTTP response wrapped in a Promise.
	 */
	createRequest<T>(callback: <J = T>(params: { http: HttpService }) => Promise<HttpServiceResponse<J>>): Promise<HttpServiceResponse<T>>;
}

export class BaseDatasource implements IDatasource {
	protected readonly httpClient: HttpService;

	constructor(httpClient: HttpService) {
		this.httpClient = httpClient;
	}

	async createRequest<T>(callback: <J = T>(params: { http: HttpService }) => Promise<HttpServiceResponse<J>>): Promise<HttpServiceResponse<T>> {
		return await callback({ http: this.httpClient })
			.then((response) => <HttpServiceResponse<T>>response)
			.catch((err: HttpServiceError<unknown>) => {
				throw err;
			});
	}
}
