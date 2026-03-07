import ky, { type Options, type HTTPError } from 'ky';

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
	responseFormat?: 'json' | 'blob' | 'text' | 'arrayBuffer' | 'body';
}

export interface IHttpServiceInstanceResponse<T = unknown> extends Response {
	arrayBuffer: () => Promise<ArrayBuffer>;
	blob: () => Promise<Blob>;
	formData: () => Promise<FormData>;
	json: <J = T>() => Promise<J>;
	text: () => Promise<string>;
}

export interface IHttpServiceInstance {
	get: <T>(url: string | URL | Request, options?: IHttpServiceOptions) => Promise<IHttpServiceInstanceResponse<T>>;
	post: <T>(url: string | URL | Request, options?: IHttpServiceOptions) => Promise<IHttpServiceInstanceResponse<T>>;
	put: <T>(url: string | URL | Request, options?: IHttpServiceOptions) => Promise<IHttpServiceInstanceResponse<T>>;
	delete: <T>(url: string | URL | Request, options?: IHttpServiceOptions) => Promise<IHttpServiceInstanceResponse<T>>;
	patch: <T>(url: string | URL | Request, options?: IHttpServiceOptions) => Promise<IHttpServiceInstanceResponse<T>>;
	head?: (url: string | URL | Request, options?: IHttpServiceOptions) => Promise<IHttpServiceInstanceResponse>;
	create: (defaultOptions?: IHttpServiceOptions) => IHttpServiceInstance;
	extend?: (defaultOptions: IHttpServiceOptions | ((parentOptions: IHttpServiceOptions) => IHttpServiceOptions)) => IHttpServiceInstance;
	readonly stop: typeof stop;
}

export class HttpService {
	private baseUrl;
	private readonly instance;
	private readonly requestHandler?: (options: Options) => void | Promise<void>;
	private readonly errorHandler?: (err: IHttpServiceError) => HttpServiceError<unknown>;
	private readonly globalErrorHandler?: (err: unknown) => Promise<HttpServiceError<unknown>>;

	constructor(opts: {
		baseUrl: string;
		instance?: IHttpServiceInstance;
		baseOptions?: Options;
		onRequest?: (options: Options) => void | Promise<void>;
		onError?: (err: IHttpServiceError) => HttpServiceError<unknown>;
		handleError?: (err: unknown) => Promise<HttpServiceError<unknown>>;
	}) {
		this.baseUrl = opts.baseUrl;
		this.instance = opts.instance ? opts.instance.create(opts?.baseOptions) : ky.create(opts?.baseOptions);
		this.errorHandler = opts?.onError ?? undefined;
		this.requestHandler = opts?.onRequest ?? undefined;
		this.globalErrorHandler = opts?.handleError ?? undefined;
	}

	setBaseUrl(newBaseUrl: string) {
		this.baseUrl = newBaseUrl;
	}

	private async prepareOptions(requestOptions?: IHttpServiceOptions) {
		const options = typeof requestOptions === 'object' ? { ...requestOptions } : {};
		if (this.requestHandler) {
			await this.requestHandler(options);
		}
		return options;
	}

	private async prepareResponse<T>(request: IHttpServiceInstanceResponse<T>, format: IHttpServiceOptions['responseFormat'] = 'json') {
		let data: T;
		try {
			switch (format) {
				case 'blob':
					data = (await request.blob()) as T;
					break;
				case 'text':
					data = (await request.text()) as T;
					break;
				case 'arrayBuffer':
					data = (await request.arrayBuffer()) as T;
					break;
				case 'body':
					data = request.body as T;
					break;
				case 'json':
					data = (await request.json()) as T;
					break;
				default:
					data = (await request.json()) as T;
					break;
			}
		} catch {
			data = null as T;
		}

		return new HttpServiceResponse<T>({
			headers: request.headers instanceof Headers ? Object.fromEntries(request.headers.entries()) : {},
			status: request.status,
			success: request.status < 400,
			data,
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

	private async handleError(error: unknown): Promise<HttpServiceError<unknown>> {
		return this.globalErrorHandler ? await this.globalErrorHandler(error) : await this.baseErrorHandler(error as HTTPError);
	}

	private async baseErrorHandler(err?: HTTPError): Promise<HttpServiceError<unknown>> {
		let headers: Record<string, string>;
		let response: unknown;
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
		return this.errorHandler ? this.errorHandler(error) : error;
	}
}
