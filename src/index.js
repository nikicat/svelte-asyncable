import { writable, derived, get } from 'svelte/store';

export function asyncable(getter, setter = () => {}, stores = []) {
	const derived$ = derived(stores, (values) => values);
	let store$ = null;
	let stop = () => {};

	store$ = writable(null, (set) => {
		const derivedStop = derived$.subscribe(async (values = []) => {
			// Set promise on start to avoid yielding null
			// It will never be resolved
			let reject_;
			set(
				new Promise((resolve, reject) => {
					reject_ = reject;
				})
			);
			try {
				stop =
					(await getter((value) => {
						store$.set(Promise.resolve(value));
					}, ...values)) || (() => {});
			} catch (err) {
				reject_(err);
			}
		});
		return () => {
			stop();
			derivedStop();
		};
	});

	async function set(newValue, oldValue) {
		if (newValue === oldValue) return;
		store$.set(Promise.resolve(newValue));
		try {
			await setter(newValue, oldValue);
		} catch (err) {
			store$.set(Promise.resolve(oldValue));
			throw err;
		}
	}

	return {
		subscribe: store$.subscribe,
		async update(reducer) {
			if (!setter) return;
			let oldValue;
			let newValue;
			try {
				oldValue = await get(store$);
				newValue = await reducer(shallowCopy(oldValue));
			} finally {
				await set(newValue, oldValue);
			}
		},
		async set(newValue) {
			if (!setter) return;
			let oldValue;
			try {
				oldValue = await get(store$);
				newValue = await newValue;
			} finally {
				await set(newValue, oldValue);
			}
		},
		get() {
			return get(store$);
		},
	};
}

export function syncable(stores, initialValue) {
	return derived(
		stores,
		($values, set) =>
			(Array.isArray(stores) ? Promise.allSettled : Promise.resolve)
				.call(Promise, $values)
				.then(set),
		initialValue
	);
}

function shallowCopy(value) {
	if (typeof value !== 'object' || value === null) return value;
	return Array.isArray(value) ? [...value] : { ...value };
}
