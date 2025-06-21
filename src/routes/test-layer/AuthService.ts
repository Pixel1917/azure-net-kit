import { BaseService } from '$lib/core/service/index.js';
import { AuthRepository } from './AuthRepository.js';
import { LoginRequest } from './LoginRequest.js';
import { BaseResponse } from '$lib/core/response/index.js';
import { HttpServiceResponse } from '$lib/core/httpService/index.js';
import type { ILoginRequest, ILoginResponse } from './Abstracts.js';

class LoginResponse extends BaseResponse<ILoginResponse, string> {
	transform(response: HttpServiceResponse<ILoginResponse>) {
		return response.data.token;
	}
}

export class AuthService extends BaseService {
	constructor(private authRepository = new AuthRepository()) {
		super();
	}

	async login(data: Partial<ILoginRequest> | FormData) {
		const request = new LoginRequest(data);
		return await this.transformResponse(this.authRepository.login(request.json()), { responseModel: LoginResponse });
	}

	async current() {
		return await this.authRepository
			.current()
			.then((response) => response.data)
			.catch(() => undefined);
	}
}
