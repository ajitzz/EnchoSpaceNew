import re

with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

old_push = r"""          spatialPhotos\.push\(\{
            id: photo\.id \|\| `\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.substr\(2, 6\)\}`,
            url,
            category: photo\.category \|\| 'living_room',
            title: photo\.title \|\| '',
            description: photo\.description \|\| '',
            specs: photo\.specs \|\| '',
            lightingTime: \(photo as any\)\.lightingTime \|\| '',
            isHero: \(photo as any\)\.isHero \|\| false
          \}\);"""

new_push = """          spatialPhotos.push({
            id: photo.id || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            url,
            category: photo.category || 'other',
            tier: photo.tier || 'common',
            title: photo.title || '',
            description: photo.description || '',
            specs: photo.specs || '',
            lightingTime: (photo as any).lightingTime || '',
            isHero: (photo as any).isHero || false
          });"""

content = re.sub(old_push, new_push, content)

# Check where spatialPhotos is sent to API
api_payload_regex = r"""const payload = \{
        title: formData\.title,
[\s\S]*?
        dynamicPricing: formData\.dynamicPricing,
      \};"""

api_payload_new = """const payload = {
        title: formData.title,
        description: formData.description,
        video_url: formData.videoUrl,
        price: parseFloat(formData.price),
        type: formData.type,
        address: formData.address,
        city: formData.city,
        image_urls: uploadedImageUrls,
        image_url: uploadedImageUrls[0] || '',
        photos: spatialPhotos, // THE MASTERFUL 2D MATRIX PAYLOAD
        max_guests: formData.maxGuests,
        bedrooms: formData.bedrooms,
        beds: formData.beds,
        bathrooms: formData.bathrooms,
        amenities: formData.amenities,
        rental_mode: formData.rentalMode,
        rooms: processedRooms,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
        seo_keywords: formData.seo_keywords,
        seo_image_url: formData.seo_image_url,
        dynamicPricing: formData.dynamicPricing,
        hero_video_url: formData.hero_video_url,
        hero_fallback_url: formData.hero_fallback_url,
        dominant_color_hex: formData.dominant_color_hex,
        raw_rules: formData.raw_rules,
        curated_guidelines: formData.curated_guidelines,
        experience_tags: formData.experience_tags,
        amenity_clusters: formData.amenity_clusters,
        child_safety_specs: formData.child_safety_specs,
        nearby: formData.nearby,
      };"""

# Replace payload definition
content = re.sub(r"const payload = \{[\s\S]*?dynamicPricing: formData\.dynamicPricing,\n\s*\};", api_payload_new, content)

with open('components/HostForm.tsx', 'w') as f:
    f.write(content)
print("Patched HostForm.tsx payload mapping!")
