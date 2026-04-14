import { AppPresenter } from '../../../../core/Presenter/index.js';
import { ApplicationProvider } from '../../Application/Providers/index.js';
import { CreateScriptSchema, UpdateScriptSchema } from './Schema/index.js';
import type { IScriptCollectionQuery, IScriptCreateRequest, IScriptUpdateRequest } from '../../Domain/Ports/Script/index.js';
import type { IScript } from '../../Domain/Entities/Script/index.js';

export const ScriptPresenter = AppPresenter('ScriptPresenter', ({ createAsyncResource, createAsyncAction }) => {
	const { ScriptService } = ApplicationProvider();

	const collection = async (query?: IScriptCollectionQuery) => await createAsyncResource(ScriptService.collection(query));

	const resource = async (id: number) => await createAsyncResource(ScriptService.resource(id));

	const create = async (request: Partial<IScriptCreateRequest>) =>
		await createAsyncAction<IScript, IScriptCreateRequest>(ScriptService.create(CreateScriptSchema.from(request).json()), {
			onSuccess: () => {
				//TODO: add notification and redirect;
			}
		});

	const update = async (id: number, request: IScriptUpdateRequest) =>
		await createAsyncAction(ScriptService.update(id, UpdateScriptSchema.from(request).json()));

	const remove = async (id: number) => await createAsyncAction(ScriptService.remove(id));

	return { collection, resource, create, update, remove };
});
