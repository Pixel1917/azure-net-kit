import ky, { type KyResponse, type Options, type HTTPError } from 'ky';
import { EventBus } from 'azure-net-tools';

export interface IHttpServiceResponse<T = unknown> {
	headers: Record<string, string>;
	status: number;
	success: boolean;
	data: T;
	message: string;
}

export interface IHttpServiceError<T = unknown> extends IHttpServiceResponse<T> {
	original?: Error;
}

export class HttpServiceResponse<T> implements IHttpServiceResponse<T> {
	headers: Record<string, string>;
	status: number;
	success: boolean;
	data: T;
	message: string;

	constructor({ headers, status, success, data, message }: IHttpServiceResponse<T>) {
		this.headers = headers;
		this.status = status;
		this.success = success;
		this.data = data;
		this.message = message;
	}
}

export class HttpServiceError<T> implements IHttpServiceError<T> {
	headers: Record<string, string>;
	status: number;
	success: boolean;
	data: T;
	message: string;
	original?: Error;

	constructor({ headers, status, success, data, message, original }: IHttpServiceError<T>) {
		this.headers = headers;
		this.status = status;
		this.success = success;
		this.data = data;
		this.message = message;
		this.original = original;
	}
}

export interface IHttpServiceOptions extends Options {
	responseFormat?: 'json' | 'blob' | 'text';
}

export const httpServiceEventBus = new EventBus<'HttpServiceError'>({
	HttpServiceError: []
});

export class HttpService {
	private readonly baseUrl;
	private readonly instance;
	private readonly requestHandler?: (options: Options) => void | Promise<void>;
	private readonly errorHandler?: (err: IHttpServiceError) => unknown;

	constructor(opts: {
		baseUrl: string;
		baseOptions?: Options;
		requestHandler?: (options: Options) => void | Promise<void>;
		errorHandler?: (err: IHttpServiceError) => unknown;
	}) {
		this.baseUrl = opts.baseUrl;
		this.instance = ky.create(opts?.baseOptions);
		this.errorHandler = opts?.errorHandler ?? undefined;
		this.requestHandler = opts?.requestHandler ?? undefined;
	}

	private async prepareOptions(requestOptions?: Options) {
		const options = typeof requestOptions === 'object' ? { ...requestOptions } : {};
		if (this.requestHandler) {
			await this.requestHandler(options);
		}
		return options;
	}

	private async prepareResponse<T>(request: KyResponse<T>, format: IHttpServiceOptions['responseFormat'] = 'json') {
		return new HttpServiceResponse<T>({
			headers: request.headers instanceof Headers ? Object.fromEntries(request.headers.entries()) : {},
			status: request.status,
			success: request.status <= 400,
			data: await request?.[format](),
			message: 'Request completed'
		});
	}

	async post<T>(url: string, options?: IHttpServiceOptions): Promise<IHttpServiceResponse<T>> {
		return await this.instance
			.post<T>(this.baseUrl + url, await this.prepareOptions(options))
			.then((response) => {
				return this.prepareResponse<T>(response, options?.responseFormat);
			})
			.catch(async (error: HTTPError) => {
				throw await this.handleError(error);
			});
	}

	async get<T>(url: string, options?: IHttpServiceOptions): Promise<IHttpServiceResponse<T>> {
		return await this.instance
			.get(this.baseUrl + url, await this.prepareOptions(options))
			.then((response) => {
				return this.prepareResponse<T>(response, options?.responseFormat);
			})
			.catch(async (error: HTTPError) => {
				throw await this.handleError(error);
			});
	}

	async patch<T>(url: string, options?: IHttpServiceOptions): Promise<IHttpServiceResponse<T>> {
		return await this.instance
			.patch<T>(this.baseUrl + url, await this.prepareOptions(options))
			.then((response) => {
				return this.prepareResponse<T>(response, options?.responseFormat);
			})
			.catch(async (error: HTTPError) => {
				throw await this.handleError(error);
			});
	}

	async delete<T>(url: string, options?: IHttpServiceOptions): Promise<IHttpServiceResponse<T>> {
		return await this.instance
			.delete<T>(this.baseUrl + url, await this.prepareOptions(options))
			.then((response) => {
				return this.prepareResponse<T>(response, options?.responseFormat);
			})
			.catch(async (error: HTTPError) => {
				throw await this.handleError(error);
			});
	}

	async put<T>(url: string, options?: IHttpServiceOptions): Promise<IHttpServiceResponse<T>> {
		return await this.instance
			.put<T>(this.baseUrl + url, await this.prepareOptions(options))
			.then((response) => {
				return this.prepareResponse<T>(response, options?.responseFormat);
			})
			.catch(async (error: HTTPError) => {
				throw await this.handleError(error);
			});
	}

	private async handleError(err?: HTTPError): Promise<unknown> {
		let headers: Record<string, string> = {};
		let response: unknown = {};
		try {
			headers = err?.response?.headers && err?.response?.headers instanceof Headers ? Object.fromEntries(err?.response?.headers.entries()) : {};
			response = await err?.response?.json();
		} catch {
			headers = {};
			response = {};
		}
		const error = new HttpServiceError({
			data: response,
			status: err?.response?.status ?? 500,
			headers,
			success: false,
			original: err,
			message: 'Request failed'
		});
		httpServiceEventBus.publish('HttpServiceError', error);
		return this.errorHandler ? this.errorHandler(error) : error;
	}
}
