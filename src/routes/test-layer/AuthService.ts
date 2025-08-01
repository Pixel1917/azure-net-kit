import { ResourceService } from '$lib/core/application/index.js';
import { AuthRepository } from './AuthRepository.js';
import { LoginRequest } from './LoginRequest.js';
import { BaseResponse } from '$lib/core/response/index.js';
import { HttpServiceResponse } from '$lib/core/httpService/index.js';
import type { ILoginRequest, ILoginResponse } from './Abstracts.js';
import { applicationEventBus } from './EventBus.js';

class LoginResponse extends BaseResponse<ILoginResponse, string> {
	transform(response: HttpServiceResponse<ILoginResponse>) {
		return response.data.token;
	}
}

export class AuthService extends ResourceService {
	constructor(private authRepository: AuthRepository) {
		super();
	}

	async login(data: Partial<ILoginRequest> | FormData) {
		const request = new LoginRequest(data);
		return await this.transformResponse(
			this.authRepository.login(request.json()).then((res) => {
				applicationEventBus.CreateEvent('LoggedIn', res.data.token);
				return res;
			}),
			{ responseModel: LoginResponse }
		);
	}

	async current() {
		return await this.authRepository
			.current()
			.then((response) => response.data)
			.catch(() => undefined);
	}
}
