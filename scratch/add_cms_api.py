import re

with open('server.ts', 'r') as f:
    content = f.read()

new_api = """
// --- CMS PHASE B: DRAFT & PUBLISH ROUTES ---

app.get('/api/listings/draft/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT * FROM listings_drafts WHERE id = $1 AND host_id = $2', [req.params.id, req.user?.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

app.post('/api/listings/draft', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { draftId, ...draftData } = req.body;
    if (draftId) {
      const result = await pool.query(`
        UPDATE listings_drafts 
        SET draft_data = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND host_id = $3
        RETURNING *
      `, [JSON.stringify(draftData), draftId, req.user?.id]);
      return res.json(result.rows[0]);
    } else {
      const result = await pool.query(`
        INSERT INTO listings_drafts (host_id, draft_data)
        VALUES ($1, $2)
        RETURNING *
      `, [req.user?.id, JSON.stringify(draftData)]);
      return res.json(result.rows[0]);
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

app.post('/api/admin/listings/draft/:id/approve', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draftRes = await client.query('SELECT * FROM listings_drafts WHERE id = $1', [req.params.id]);
    if (draftRes.rows.length === 0) throw new Error('Draft not found');
    
    const draft = draftRes.rows[0];
    const data = draft.draft_data;
    
    let listingId = draft.published_listing_id;
    if (listingId) {
       await client.query(`
         UPDATE listings SET 
           title = $1, description = $2, price = $3, city = $4, type = $5,
           rental_mode = $6, max_guests = $7, bedrooms = $8, beds = $9, bathrooms = $10,
           hero_video_url = $11, dominant_color_hex = $12, experience_tags = $13,
           rooms = $14, photos = $15
         WHERE id = $16
       `, [
         data.title, data.description, data.price || 0, data.city || 'Berlin', data.type,
         data.rentalMode || 'entire_place', data.maxGuests || 2, data.bedrooms || 1, data.beds || 1, data.bathrooms || 1,
         data.hero_video_url || '', data.dominant_color_hex || '#0284C7', JSON.stringify(data.experience_tags || []),
         JSON.stringify(data.rooms || []), JSON.stringify(data.photos || []),
         listingId
       ]);
    } else {
       const newListing = await client.query(`
         INSERT INTO listings (
           user_id, title, description, price, city, type, address,
           rental_mode, max_guests, bedrooms, beds, bathrooms,
           hero_video_url, dominant_color_hex, experience_tags,
           rooms, photos
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id
       `, [
         draft.host_id, data.title, data.description, data.price || 0, data.city || 'Berlin', data.type, data.address || '',
         data.rentalMode || 'entire_place', data.maxGuests || 2, data.bedrooms || 1, data.beds || 1, data.bathrooms || 1,
         data.hero_video_url || '', data.dominant_color_hex || '#0284C7', JSON.stringify(data.experience_tags || []),
         JSON.stringify(data.rooms || []), JSON.stringify(data.photos || [])
       ]);
       listingId = newListing.rows[0].id;
    }

    await client.query('DELETE FROM room_types WHERE listing_id = $1', [listingId]);
    if (data.rooms && Array.isArray(data.rooms)) {
      for (const room of data.rooms) {
         await client.query(`
            INSERT INTO room_types (listing_id, name, base_price, currency, max_occupancy, inventory_count, features, amenities)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         `, [
            listingId, room.name, room.price, data.currency || 'INR', room.capacity || 2, room.inventory_count || 1,
            JSON.stringify(room.features || []), JSON.stringify(room.amenities || [])
         ]);
      }
    }

    await client.query('DELETE FROM media_assets WHERE entity_id = $1 AND entity_type = $2', [listingId, 'listing']);
    if (data.photos && Array.isArray(data.photos)) {
      let orderIndex = 0;
      for (const photo of data.photos) {
         await client.query(`
            INSERT INTO media_assets (entity_type, entity_id, url, category, title, description, specs, lighting_time, is_hero, order_index)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         `, [
            'listing', listingId, photo.url || photo.previewUrl, photo.category || 'other', photo.title || '', photo.description || '',
            photo.specs || '', photo.lightingTime || '', photo.isHero || false, orderIndex++
         ]);
      }
    }

    await client.query(`UPDATE listings_drafts SET status = 'PUBLISHED', published_listing_id = $1 WHERE id = $2`, [listingId, draft.id]);

    await client.query('COMMIT');
    res.json({ success: true, listingId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Draft Publish Error:', e);
    res.status(500).json({ error: 'Failed to publish draft' });
  } finally {
    client.release();
  }
});

// --- END CMS PHASE B ---

"""

pattern = r'// Create listing\napp\.post\(\'/api/listings\''
match = re.search(pattern, content)
if match:
    new_content = content[:match.start()] + new_api + content[match.start():]
    with open('server.ts', 'w') as f:
        f.write(new_content)
    print("Successfully added API routes to server.ts")
else:
    print("Could not find insertion point")
