import { ClassMirror } from '$lib/index.js';
import { AuthRepository } from '../../Infrastructure/Http/Repositories/index.js';

export class AuthService extends ClassMirror<AuthRepository> {
	constructor(private authRepository: AuthRepository) {
		super(authRepository);
	}

	declare login: AuthRepository['login'];
	declare logout: AuthRepository['logout'];

	async current() {
		return this.authRepository.current().catch(() => undefined);
	}
}
