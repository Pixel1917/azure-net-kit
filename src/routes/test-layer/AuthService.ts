import { ProxyResourceService } from '$lib/core/application/index.js';
import { AuthRepository } from './AuthRepository.js';
import { LoginRequest } from './LoginRequest.js';
import type { ILoginRequest } from './Abstracts.js';

export class AuthService extends ProxyResourceService<AuthRepository> {
	constructor(private authRepository: AuthRepository) {
		super(authRepository);
	}

	async login(data: Partial<ILoginRequest> | FormData) {
		const request = new LoginRequest(data);
		return this.authRepository.login(request.json());
	}

	declare current: AuthRepository['current'];

	declare logout: AuthRepository['logout'];
}
