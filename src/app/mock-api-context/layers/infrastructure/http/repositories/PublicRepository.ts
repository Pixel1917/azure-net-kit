import { MockApiDatasource } from '../../../../../../core/datasources/index.js';
import type { IPublicEntityCollection } from '../../../domain/public/index.js';

export class PublicRepository {
	constructor(private readonly datasource: MockApiDatasource) {}

	public async collection() {
		return this.datasource
			.createRequest<IPublicEntityCollection>(({ http }) => http.get('/public-route'))
			.then((res) => res.countElementsAndAddToMeta().get());
	}
}
