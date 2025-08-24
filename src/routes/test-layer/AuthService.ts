import { ClassMirror } from '$lib/core/shared/classMirror/index.js';
import { AuthRepository } from './AuthRepository.js';
import type { ILoginRequest } from './Abstracts.js';

export class AuthService extends ClassMirror<AuthRepository> {
	constructor(private authRepository: AuthRepository) {
		super(authRepository);
	}

	async login(data: ILoginRequest | FormData) {
		return this.authRepository.login(data);
	}

	declare current: AuthRepository['current'];

	declare logout: AuthRepository['logout'];
}
