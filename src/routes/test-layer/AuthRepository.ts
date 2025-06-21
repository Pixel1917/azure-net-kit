import { AzureNetRestDatasource } from './AzureDataSource.js';
import type { ILoginRequest, ILoginResponse, IUser } from './Abstracts.js';

export class AuthRepository {
	constructor(private source = new AzureNetRestDatasource()) {}

	public async login(data: ILoginRequest) {
		return await this.source.createRequest<ILoginResponse>(({ http }) => {
			return http.post('/auth/login', { json: data });
		});
	}

	public async current() {
		return await this.source.createRequest<IUser>(({ http }) => http.get('/auth/current'));
	}

	public async logout() {
		return await this.source.createRequest<void>(({ http }) => http.post('/auth/logout'));
	}
}
