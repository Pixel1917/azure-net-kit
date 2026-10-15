import {
	HttpServiceInstance,
	type IHttpInstanceOptions,
	type IHttpServiceInstance,
	type IHttpServiceResponse
} from '../http-service/HttpServiceInstance.js';
import { type IQueryBuilderInstance, type IQueryBuilderSettings, QueryBuilder } from '../query/index.js';

export type CreateRequestCallbackType<T> = (params: { http: IHttpServiceInstance; query: IQueryBuilderInstance }) => Promise<IHttpServiceResponse<T>>;

type HttpClientParams = { http: IHttpServiceInstance; httpOptions?: never } | { http?: never; httpOptions?: IHttpInstanceOptions };
type QueryBuilderParams = { query: IQueryBuilderInstance; queryOptions?: never } | { query?: never; queryOptions?: IQueryBuilderSettings };

type DatasourceParams = HttpClientParams & QueryBuilderParams;

export class BaseHttpDatasource {
	protected readonly httpClient: IHttpServiceInstance;
	protected readonly query: IQueryBuilderInstance;

	constructor(params: DatasourceParams) {
		this.httpClient = params.http ?? new HttpServiceInstance(params?.httpOptions);
		this.query = params.query ?? new QueryBuilder(params?.queryOptions);
	}

	private _createRawRequest<T>(callback: CreateRequestCallbackType<T>): Promise<IHttpServiceResponse<T>> {
		return callback({ http: this.httpClient, query: this.query });
	}

	public readonly createRawRequest = this._createRawRequest.bind(this);
}
