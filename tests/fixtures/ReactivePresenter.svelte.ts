export class ReactivePresenter {
	count = $state(0);
	increment = () => ++this.count;
}
