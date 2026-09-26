-- Migration: 042_marketing_creative_packages.sql
-- Milestone: Sprint 2 / Phase 3 Milestone 7 & Blueprint Section 5 (Standalone Reel & Creative Package Pipeline)
-- Fulfilling: Decision 037-G & Blueprint Gap G-07
-- Invariants:
--   - Standalone ad creatives (9:16 Reels) bind to marketing campaigns and NEVER pollute listing architectural photo galleries (listings.photos).
--   - Package types: STANDALONE_REEL, CAROUSEL, IMAGE_POST, GALLERY_COLLECTION.
--   - Asset roles: PRIMARY_VIDEO, POST_IMAGE, CAROUSEL_SLIDE, THUMBNAIL.
--   - Aspect ratios: 9:16, 1:1, 16:9, 4:5.
--   - Duration for reels strictly capped at 60.00 seconds.
--   - Mandatory host rights attestation hash (SHA-256).

CREATE TABLE IF NOT EXISTS marketing_creative_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  room_type_id INT REFERENCES room_types(id) ON DELETE SET NULL,
  package_type VARCHAR(50) NOT NULL CHECK (package_type IN ('STANDALONE_REEL', 'CAROUSEL', 'IMAGE_POST', 'GALLERY_COLLECTION')),
  title VARCHAR(200) NOT NULL,
  headline VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  ai_preflight_score DECIMAL(3, 1),
  ai_preflight_status VARCHAR(50) DEFAULT 'PENDING_SCAN',
  moderation_status VARCHAR(50) DEFAULT 'SUBMITTED' CHECK (moderation_status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'QUARANTINED')),
  rejection_reasons JSONB DEFAULT '[]'::jsonb,
  rights_attestation_confirmed BOOLEAN DEFAULT false,
  rights_attestation_hash VARCHAR(64),
  version INT DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_creative_packages_host ON marketing_creative_packages(host_user_id);
CREATE INDEX IF NOT EXISTS idx_creative_packages_listing ON marketing_creative_packages(listing_id);
CREATE INDEX IF NOT EXISTS idx_creative_packages_status ON marketing_creative_packages(moderation_status);

CREATE TABLE IF NOT EXISTS marketing_creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES marketing_creative_packages(id) ON DELETE CASCADE,
  asset_role VARCHAR(50) NOT NULL CHECK (asset_role IN ('PRIMARY_VIDEO', 'POST_IMAGE', 'CAROUSEL_SLIDE', 'THUMBNAIL')),
  original_url TEXT NOT NULL,
  transcoded_url TEXT,
  aspect_ratio VARCHAR(20) NOT NULL CHECK (aspect_ratio IN ('9:16', '1:1', '16:9', '4:5')),
  duration_seconds DECIMAL(5, 2) CHECK (duration_seconds IS NULL OR duration_seconds <= 60.00),
  byte_size INT NOT NULL CHECK (byte_size > 0),
  mime_type VARCHAR(100) NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  ocr_extracted_text TEXT,
  transcript_text TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_creative_assets_package ON marketing_creative_assets(package_id);
CREATE INDEX IF NOT EXISTS idx_creative_assets_role ON marketing_creative_assets(asset_role);
