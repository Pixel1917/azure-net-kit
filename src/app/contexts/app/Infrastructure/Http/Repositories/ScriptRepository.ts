import { AzureNetRestDatasource } from '../../../../../core/index.js';
import type { IScriptCollection, IScriptCreateRequest, IScriptUpdateRequest } from '../../../Domain/Ports/Script/index.js';
import type { IScript } from '../../../Domain/Entities/Script/index.js';

export class ScriptRepository {
	private endpoint = '/scripts';
	constructor(private azureNetRestDatasource: AzureNetRestDatasource) {}

	public async collection() {
		return this.azureNetRestDatasource.createRequest<IScriptCollection>(({ http }) => http.get(this.endpoint)).then((res) => res.paginate().get());
	}

	public async resource(id: number) {
		return this.azureNetRestDatasource.createRequest<IScript>(({ http }) => http.get(`${this.endpoint}/${id}`)).then((res) => res.getData());
	}

	public async create(data: IScriptCreateRequest) {
		return this.azureNetRestDatasource.createRequest<IScript>(({ http }) => http.post(this.endpoint, { json: data })).then((res) => res.getData());
	}

	public async update(id: number, data: IScriptUpdateRequest) {
		return this.azureNetRestDatasource
			.createRequest<IScript>(({ http }) => http.put(`${this.endpoint}/${id}`, { json: data }))
			.then((res) => res.getData());
	}

	public async remove(id: number) {
		return this.azureNetRestDatasource.createRequest<never>(({ http }) => http.delete(`${this.endpoint}/${id}`));
	}
}
