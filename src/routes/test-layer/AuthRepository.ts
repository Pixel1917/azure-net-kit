import { AzureNetRestDatasource } from './AzureDataSource.js';
import type { ILoginRequest, ILoginResponse, IUser } from './Abstracts.js';

export class AuthRepository {
	constructor(private source: AzureNetRestDatasource) {}

	public async login(request: ILoginRequest) {
		return this.source
			.createRequest<ILoginResponse>(({ http }) => http.post('/auth/login', { json: request }))
			.then((res) => res.extract('token').getData());
	}

	public async current() {
		return this.source.createRequest<IUser>(({ http }) => http.get('/auth/current')).then((res) => res.getData());
	}

	public async logout() {
		return this.source.createRequest<void>(({ http }) => http.post('/auth/logout')).then((res) => res.getData());
	}
}
