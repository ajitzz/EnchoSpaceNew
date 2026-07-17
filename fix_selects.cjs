const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `app.get('/api/marketing/campaigns', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const result = await pool.query('SELECT * FROM host_marketing_campaigns WHERE host_id = $1 ORDER BY created_at DESC', [req.user?.id]);
    res.json(result.rows);
  } catch (error) {`;
const replacement1 = `app.get('/api/marketing/campaigns', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    // SECURITY: Filter out CAPI Tokens when returning campaigns to client
    const result = await pool.query(\`
       SELECT 
         id, host_id, listing_id, title, description, video_url, media_urls, 
         platforms, budget, status, created_at, updated_at, ai_grade, ai_feedback, 
         admin_feedback, target_locations, ad_format, feed_description, rejected_fields,
         meta_pixel_id, google_conversion_id, google_conversion_label,
         subscription_active, payment_status, payment_gateway, payment_intent_id,
         active_slide_index, admin_approved, meta_campaign_id, meta_dispatched_at,
         pacing_mode, accumulated_spent, accumulated_impressions
       FROM host_marketing_campaigns 
       WHERE host_id = $1 
       ORDER BY created_at DESC
    \`, [req.user?.id]);
    res.json(result.rows);
  } catch (error) {`;
code = code.replace(target1, replacement1);

const target2 = `app.get('/api/marketing/campaigns/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1 AND host_id = $2', [id, req.user?.id]);`;
const replacement2 = `app.get('/api/marketing/campaigns/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    const { id } = req.params;
    const result = await pool.query(\`
       SELECT 
         id, host_id, listing_id, title, description, video_url, media_urls, 
         platforms, budget, status, created_at, updated_at, ai_grade, ai_feedback, 
         admin_feedback, target_locations, ad_format, feed_description, rejected_fields,
         meta_pixel_id, google_conversion_id, google_conversion_label,
         subscription_active, payment_status, payment_gateway, payment_intent_id,
         active_slide_index, admin_approved, meta_campaign_id, meta_dispatched_at,
         pacing_mode, accumulated_spent, accumulated_impressions
       FROM host_marketing_campaigns 
       WHERE id = $1 AND host_id = $2
    \`, [id, req.user?.id]);`;
code = code.replace(target2, replacement2);

fs.writeFileSync('server.ts', code);
console.log('Fixed GET queries');
