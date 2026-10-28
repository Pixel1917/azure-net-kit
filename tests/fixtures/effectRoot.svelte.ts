export const createEffectRoot = (setup: () => void): (() => void) => $effect.root(setup);
