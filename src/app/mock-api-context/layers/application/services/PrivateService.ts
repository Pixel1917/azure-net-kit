import { ClassMirror } from '$lib/core/index.js';
import { PrivateRepository } from '../../infrastructure/http/repositories/index.js';

export class PrivateService extends ClassMirror {
	constructor(private privateRepository: PrivateRepository) {
		super(privateRepository);
	}

	declare collection: PrivateRepository['collection'];
}
