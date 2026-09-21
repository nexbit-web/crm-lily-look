/**
 * Проміс, який резолвиться ззовні.
 *
 * Потрібен, щоб перевіряти паралельність: мок віддає «завислий» проміс, і
 * видно, чи встиг код відправити решту запитів, не чекаючи на перший.
 */
export function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
