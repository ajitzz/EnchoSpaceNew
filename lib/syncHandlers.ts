import { registerCustomSyncHandler } from './syncService';
import { encodeImageToBlurhash } from './blurhash';

async function uploadPhotoList(photoList: any[]) {
    const uploadPromises = photoList.map(async (photo) => {
        if (!photo.file && photo.previewUrl) {
            return photo.previewUrl;
        }
        
        const file = photo.file;
        let filename = file.name;
        if (file.type === 'image/webp' && !filename.toLowerCase().endsWith('.webp')) {
            filename = filename.replace(/\.[^/.]+$/, "") + ".webp";
        }

        // Generate Blurhash before uploading
        let blurhashStr = photo.blurhash;
        if (!blurhashStr) {
           try {
               blurhashStr = await encodeImageToBlurhash(file);
           } catch (e) {
               console.warn("Failed to generate blurhash", e);
           }
        }

        const presignRes = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, contentType: file.type }),
        });
        
        if (!presignRes.ok) {
            throw new Error('Failed to create upload URL');
        }
        
        const { uploadUrl, fileUrl } = await presignRes.json();

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
        });

        if (!uploadRes.ok) throw new Error('Failed to upload file to S3');

        // Append Blurhash to the URL as a hash fragment
        return blurhashStr ? `${fileUrl}#blurhash=${encodeURIComponent(blurhashStr)}` : fileUrl;
    });
    return Promise.all(uploadPromises);
}

export function initSyncHandlers() {
    registerCustomSyncHandler('upload_listing', async (item) => {
        try {
            const { existingListing, formData, photos, user } = item.body;
            
            const uploadedImageUrls = await uploadPhotoList(photos);
            const mainImageUrl = uploadedImageUrls.length > 0 ? uploadedImageUrls[0] : (existingListing?.imageUrl || '');

            const updatedRooms = await Promise.all(
                formData.rooms.map(async (room: any) => {
                    const roomImageUrls = room.photos ? await uploadPhotoList(room.photos) : (room.imageUrls || []);
                    const { photos: _photos, ...roomData } = room;
                    return { ...roomData, imageUrls: roomImageUrls };
                })
            );

            const payload = {
                ...formData,
                rooms: updatedRooms,
                price: parseFloat(formData.price) || 0,
                imageUrl: mainImageUrl,
                imageUrls: uploadedImageUrls,
                userId: user?.id
            };
            
            const endpoint = existingListing ? `/api/listings/${existingListing.id}` : '/api/listings';
            const method = existingListing ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('Failed to save listing');
            
            return true;
        } catch (e) {
            console.error('Custom sync handler failed', e);
            return false;
        }
    });
}
