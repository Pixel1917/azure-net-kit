export class ReactivePresenter {
	count = $state(0);
	increment = () => ++this.count;
	add(amount: number) {
		this.count += amount;
	}
	get doubled() {
		return this.count * 2;
	}
}
