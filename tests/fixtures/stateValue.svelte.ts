export const createStateValue = <T>(value: T): T => {
	const state = $state(value);
	return state;
};
