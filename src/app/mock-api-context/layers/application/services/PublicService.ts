import { ClassMirror } from '$lib/core/index.js';
import { PublicRepository } from '../../infrastructure/http/repositories/index.js';

export class PublicService extends ClassMirror<PublicRepository> {
	constructor(private publicRepository: PublicRepository) {
		super(publicRepository);
	}

	declare collection: PublicRepository['collection'];
}
