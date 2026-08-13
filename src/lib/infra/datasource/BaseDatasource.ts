import { createHttpServiceInstance, type IHttpServiceInstance, type IHttpServiceResponse } from '../http-service/HttpServiceInstance.js';
import { type IQueryBuilderInstance, createQueryInstance } from '../query/index.js';

export type CreateRequestCallbackType<T> = (params: { http: IHttpServiceInstance; query: IQueryBuilderInstance }) => Promise<IHttpServiceResponse<T>>;

export class BaseHttpDatasource {
	protected readonly httpClient: IHttpServiceInstance;
	protected readonly query: IQueryBuilderInstance;

	constructor(params: { http?: IHttpServiceInstance; query?: IQueryBuilderInstance }) {
		this.httpClient = params.http ?? createHttpServiceInstance();
		this.query = params.query ?? createQueryInstance();
	}

	private _createRawRequest<T>(callback: CreateRequestCallbackType<T>): Promise<IHttpServiceResponse<T>> {
		return callback({ http: this.httpClient, query: this.query });
	}

	public readonly createRawRequest = this._createRawRequest.bind(this);
}
