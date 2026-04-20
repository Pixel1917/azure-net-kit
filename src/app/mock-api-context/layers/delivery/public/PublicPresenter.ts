import { AppPresenter } from '../../../../../core/presenters/index.js';
import { ApplicationProvider } from '../../application/providers/index.js';

export const PublicPresenter = AppPresenter('MockContextPublicPresenter', ({ createAsyncResource }) => {
	const { PublicService } = ApplicationProvider();

	const collection = () => createAsyncResource(() => PublicService.collection());

	return { collection };
});
