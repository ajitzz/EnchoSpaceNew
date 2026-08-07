const fs = require("fs");
let code = fs.readFileSync("components/HostForm.tsx", "utf8");

const replacement = `  const uploadPhotoFile = async (file: File) => {
    const token = localStorage.getItem('token');
    const presignRes = await fetch('/api/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
      },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!presignRes.ok) throw new Error('Failed to create upload URL');
    const { uploadUrl, fileUrl } = await presignRes.json();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!uploadRes.ok) throw new Error('Failed to upload file');
    return fileUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Final check for all steps
    for (let i = 1; i <= 5; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      // Upload main property photos
      const uploadedImageUrls: string[] = [];
      for (const photo of photos) {
        if (photo.file) {
          const url = await uploadPhotoFile(photo.file);
          uploadedImageUrls.push(url);
        } else if (photo.previewUrl && !photo.previewUrl.startsWith('blob:')) {
          uploadedImageUrls.push(photo.previewUrl);
        }
      }

      // Upload room photos if any
      const processedRooms = await Promise.all(
        formData.rooms.map(async (room: any) => {
          const roomPhotoUrls: string[] = [];
          if (room.photos && Array.isArray(room.photos)) {
            for (const rp of room.photos) {
              if (rp.file) {
                const url = await uploadPhotoFile(rp.file);
                roomPhotoUrls.push(url);
              } else if (rp.previewUrl && !rp.previewUrl.startsWith('blob:')) {
                roomPhotoUrls.push(rp.previewUrl);
              }
            }
          } else if (room.imageUrls && Array.isArray(room.imageUrls)) {
            roomPhotoUrls.push(...room.imageUrls);
          }
          return {
            ...room,
            imageUrls: roomPhotoUrls,
            imageUrl: roomPhotoUrls[0] || ''
          };
        })
      );

      const payload = {
        title: formData.title,
        description: formData.description,
        price: parseFloat(formData.price) || 0,
        type: formData.type,
        address: formData.address,
        city: formData.city,
        imageUrl: uploadedImageUrls[0] || '',
        imageUrls: uploadedImageUrls,
        videoUrl: formData.videoUrl || '',
        rentalMode: formData.rentalMode,
        rooms: processedRooms,
        maxGuests: formData.maxGuests,
        bedrooms: formData.bedrooms,
        beds: formData.beds,
        bathrooms: formData.bathrooms,
        amenities: formData.amenities,
        lat: formData.lat,
        lng: formData.lng,
        dynamicPricing: formData.dynamicPricing
      };

      const endpoint = existingListing?.id ? \`/api/listings/\${existingListing.id}\` : '/api/listings';
      const method = existingListing?.id ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save listing');
      }

      addToast("Success", existingListing ? "Property successfully updated!" : "Property successfully published!", "success");
      setSubmitted(true);
      setTimeout(() => {
        onSuccess();
        onBack();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to list space:', error);
      addToast("Upload Failed", error.message || 'Failed to publish property listing.', 'error');
    } finally {
      setLoading(false);
    }
  };`;

const startIdx = code.indexOf('  const handleSubmit = async (e: React.FormEvent) => {');
const endIdx = code.indexOf('  if (submitted) {');

if (startIdx !== -1 && endIdx !== -1) {
  const newCode = code.slice(0, startIdx) + replacement + '\n\n  ' + code.slice(endIdx);
  fs.writeFileSync("components/HostForm.tsx", newCode, "utf8");
  console.log("Successfully patched HostForm.tsx!");
} else {
  console.error("Could not find start/end indices for replacement.");
}
