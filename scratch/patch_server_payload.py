import re

with open('server.ts', 'r') as f:
    content = f.read()

# 1. Patch POST /api/listings
old_post_listings = r"const \{ amenity_clusters, child_safety_specs, nearby \} = req\.body;"
new_post_listings = """const { amenity_clusters, child_safety_specs, nearby, photos } = req.body;
    const safePhotos = Array.isArray(photos) ? JSON.stringify(photos) : JSON.stringify([]);"""

content = re.sub(old_post_listings, new_post_listings, content)

old_insert = r"""INSERT INTO listings \(user_id, title, description, price, type, address, city, image_url, image_urls, video_url, rental_mode, rooms, max_guests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamic_pricing, seo_title, seo_description, seo_keywords, seo_image_url, amenity_clusters, child_safety_specs, nearby, hero_video_url, hero_fallback_url, dominant_color_hex, raw_rules, curated_guidelines, experience_tags\)
       VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14, \$15, \$16, \$17, \$18, \$19, \$20, \$21, \$22, \$23, \$24, \$25, \$26, \$27, \$28, \$29, \$30, \$31, \$32, \$33\) RETURNING \*"""
new_insert = """INSERT INTO listings (user_id, title, description, price, type, address, city, image_url, image_urls, video_url, rental_mode, rooms, max_guests, bedrooms, beds, bathrooms, amenities, lat, lng, dynamic_pricing, seo_title, seo_description, seo_keywords, seo_image_url, amenity_clusters, child_safety_specs, nearby, hero_video_url, hero_fallback_url, dominant_color_hex, raw_rules, curated_guidelines, experience_tags, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34) RETURNING *"""
content = re.sub(old_insert, new_insert, content)

old_values = r"Array\.isArray\(experience_tags\) \? JSON\.stringify\(experience_tags\) : JSON\.stringify\(\[\]\)\]\n    \);"
new_values = "Array.isArray(experience_tags) ? JSON.stringify(experience_tags) : JSON.stringify([]), safePhotos]\n    );"
content = re.sub(old_values, new_values, content)


# 2. Patch PUT /api/listings/:id
old_put = r"const \{ amenity_clusters, child_safety_specs, nearby \} = req\.body;"
content = re.sub(old_put, new_post_listings, content)

old_update = r"UPDATE listings SET user_id = \$1, title = \$2, description = \$3, price = \$4, type = \$5, address = \$6, city = \$7, image_url = \$8, image_urls = \$9, video_url = \$10, rental_mode = \$11, rooms = \$12, max_guests = \$13, bedrooms = \$14, beds = \$15, bathrooms = \$16, amenities = \$17, lat = \$18, lng = \$19, dynamic_pricing = \$20, seo_title = \$21, seo_description = \$22, seo_keywords = \$23, seo_image_url = \$24, amenity_clusters = \$25, child_safety_specs = \$26, nearby = \$27, hero_video_url = \$28, hero_fallback_url = \$29, dominant_color_hex = \$30, raw_rules = \$31, curated_guidelines = \$32, experience_tags = \$33 WHERE id = \$34 RETURNING \*"
new_update = "UPDATE listings SET user_id = $1, title = $2, description = $3, price = $4, type = $5, address = $6, city = $7, image_url = $8, image_urls = $9, video_url = $10, rental_mode = $11, rooms = $12, max_guests = $13, bedrooms = $14, beds = $15, bathrooms = $16, amenities = $17, lat = $18, lng = $19, dynamic_pricing = $20, seo_title = $21, seo_description = $22, seo_keywords = $23, seo_image_url = $24, amenity_clusters = $25, child_safety_specs = $26, nearby = $27, hero_video_url = $28, hero_fallback_url = $29, dominant_color_hex = $30, raw_rules = $31, curated_guidelines = $32, experience_tags = $33, photos = $34 WHERE id = $35 RETURNING *"
content = re.sub(old_update, new_update, content)

old_values_put = r"Array\.isArray\(experience_tags\) \? JSON\.stringify\(experience_tags\) : JSON\.stringify\(\[\]\), req\.params\.id\]"
new_values_put = "Array.isArray(experience_tags) ? JSON.stringify(experience_tags) : JSON.stringify([]), safePhotos, req.params.id]"
content = re.sub(old_values_put, new_values_put, content)

with open('server.ts', 'w') as f:
    f.write(content)
print("server.ts payload schema patched!")
