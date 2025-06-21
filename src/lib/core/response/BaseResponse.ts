import { HttpServiceResponse } from '$lib/core/httpService/index.js';

export interface IBaseResponse<T, D = T> {
	transform(data: HttpServiceResponse<T>): D;
	json(): D;
}

export class BaseResponse<T, D = T> implements IBaseResponse<T, D> {
	protected response: HttpServiceResponse<T>;

	constructor(response: HttpServiceResponse<T>) {
		this.response = response;
	}

	transform(response: HttpServiceResponse<T>) {
		return response.data as unknown as D;
	}

	json(): D {
		return this.transform(this.response);
	}
}
