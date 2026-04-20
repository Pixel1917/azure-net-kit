import { MockApiDatasource } from '../../../../../../core/datasources/index.js';
import type { IPrivateEntityCollection } from '../../../domain/private/index.js';

export class PrivateRepository {
	constructor(private readonly datasource: MockApiDatasource) {}

	public async collection() {
		return this.datasource
			.createRequest<IPrivateEntityCollection>(({ http }) => http.get('/private-route'))
			.then((res) => res.countElementsAndAddToMeta().get());
	}
}
