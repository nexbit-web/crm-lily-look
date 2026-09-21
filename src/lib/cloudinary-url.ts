/**
 * Вставляє трансформацію в готове посилання Cloudinary, щоб у списку товарів
 * не тягнути повнорозмірні фото.
 *
 *   .../image/upload/v123/lily-look/x.jpg
 *   → .../image/upload/w_80,h_80,c_fill,q_auto,f_auto/v123/lily-look/x.jpg
 */
export function cloudinaryThumb(url: string, size = 80): string {
	const marker = '/image/upload/';
	const at = url.indexOf(marker);
	if (at === -1) return url;

	const transform = `w_${size},h_${size},c_fill,q_auto,f_auto/`;
	return url.slice(0, at + marker.length) + transform + url.slice(at + marker.length);
}

/**
 * srcset під щільність екрана: `size` — розмір у CSS-пікселях, браузер сам
 * візьме подвійний варіант на retina. Без цього мініатюра, замовлена рівно по
 * розміру блока, на ноутбуці Apple виглядає мильною.
 */
export function cloudinarySrcset(url: string, size: number): string {
	return `${cloudinaryThumb(url, size)} 1x, ${cloudinaryThumb(url, size * 2)} 2x`;
}

/**
 * Версія для перегляду на весь екран: вписати у квадрат `maxSide`, не
 * обрізаючи й не збільшуючи (c_limit). Оригінал з телефона важить кілька
 * мегабайтів — тягнути його заради перегляду в CRM немає сенсу.
 */
export function cloudinaryPreview(url: string, maxSide = 1600): string {
	const marker = '/image/upload/';
	const at = url.indexOf(marker);
	if (at === -1) return url;

	const transform = `w_${maxSide},h_${maxSide},c_limit,q_auto,f_auto/`;
	return url.slice(0, at + marker.length) + transform + url.slice(at + marker.length);
}
