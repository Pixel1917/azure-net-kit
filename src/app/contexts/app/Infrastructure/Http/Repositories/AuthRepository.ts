import { AzureNetRestDatasource } from '../../../../../core/index.js';
import type { ILoginRequest, ILoginResponse } from '../../../Domain/Ports/Auth/index.js';
import type { IUser } from '../../../Domain/Entities/User/index.js';

export class AuthRepository {
	constructor(private azureNetRestDatasource: AzureNetRestDatasource) {}

	public async login(request: ILoginRequest) {
		return this.azureNetRestDatasource
			.createRequest<ILoginResponse>(({ http }) => http.post('/auth/login', { json: request }))
			.then((res) => res.getData());
	}

	public async current() {
		return this.azureNetRestDatasource.createRequest<IUser>(({ http }) => http.get('/auth/current')).then((res) => res.getData());
	}

	public async logout() {
		return this.azureNetRestDatasource.createRequest<void>(({ http }) => http.post('/auth/logout')).then((res) => res.getData());
	}
}
