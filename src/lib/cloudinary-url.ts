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
