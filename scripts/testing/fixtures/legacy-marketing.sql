-- Legacy read-model fixture, copied from server.ts bootstrap on 21 September 2026.

-- It is NOT migration, RLS, trigger or transaction acceptance. Those require disposable PostgreSQL.

-- No sample users, tokens, provider entities, balances, or successful operations are seeded.

-- Source table: admin_audit_logs

CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES users(id) ON DELETE SET NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id INT NOT NULL,
      action VARCHAR(100) NOT NULL,
      previous_state JSONB,
      new_state JSONB,
      ip_address VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: async_webhook_queue

CREATE TABLE IF NOT EXISTS async_webhook_queue (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: campaign_creative_variants

CREATE TABLE IF NOT EXISTS campaign_creative_variants (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        meta_creative_id VARCHAR(255),
        meta_ad_id VARCHAR(255),
        asset_sha256 VARCHAR(64),
        media_url TEXT,
        media_type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        is_published BOOLEAN DEFAULT FALSE,
        variant_activated_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

-- Source table: campaign_daily_rollups

CREATE TABLE IF NOT EXISTS campaign_daily_rollups (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      spent_usd NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, date)
    );

-- Source table: campaign_financial_contracts

CREATE TABLE IF NOT EXISTS campaign_financial_contracts (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE UNIQUE,
      gross_host_charge BIGINT NOT NULL,
      encho_fee_amount BIGINT NOT NULL,
      meta_authorized_spend BIGINT NOT NULL,
      meta_configured_max_spend BIGINT NOT NULL DEFAULT 0,
      meta_actual_spend BIGINT NOT NULL DEFAULT 0,
      meta_remaining_authorization BIGINT NOT NULL,
      currency VARCHAR(10) NOT NULL,
      CONSTRAINT chk_gross_math CHECK (gross_host_charge = encho_fee_amount + meta_authorized_spend),
      CONSTRAINT chk_config_max CHECK (meta_configured_max_spend <= meta_authorized_spend),
      CONSTRAINT chk_actual_max CHECK (meta_actual_spend <= meta_authorized_spend)
    );

-- Source table: campaign_metrics

CREATE TABLE IF NOT EXISTS campaign_metrics (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      impressions INT DEFAULT 0,
      clicks INT DEFAULT 0,
      leads INT DEFAULT 0,
      conversions INT DEFAULT 0,
      spent DECIMAL DEFAULT 0,
      platform VARCHAR(50) DEFAULT 'meta',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, date, platform)
    );

-- Source table: campaign_raw_event_logs

CREATE TABLE IF NOT EXISTS campaign_raw_event_logs (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      impressions_delta INTEGER DEFAULT 0,
      clicks_delta INTEGER DEFAULT 0,
      conversions_delta INTEGER DEFAULT 0,
      spent_delta NUMERIC(10,2) DEFAULT 0,
      processed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: dco_evaluation_transactions

CREATE TABLE IF NOT EXISTS dco_evaluation_transactions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        evaluation_epoch VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'EVALUATING',
        lease_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        winner_variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE SET NULL,
        loser_variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE SET NULL,
        winner_metric_value NUMERIC(12,4),
        loser_metric_value NUMERIC(12,4),
        relative_advantage NUMERIC(8,4),
        decision VARCHAR(50),
        optimization_metric VARCHAR(50) DEFAULT 'CPC',
        evaluation_window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        evaluation_window_end TIMESTAMP WITH TIME ZONE,
        metrics_snapshot JSONB DEFAULT '{}',
        decision_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, evaluation_epoch)
      );

-- Source table: dco_external_actions

CREATE TABLE IF NOT EXISTS dco_external_actions (
        id SERIAL PRIMARY KEY,
        action_key VARCHAR(255) NOT NULL UNIQUE,
        campaign_id INTEGER NOT NULL REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        evaluation_id INTEGER REFERENCES dco_evaluation_transactions(id) ON DELETE SET NULL,
        variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        meta_ad_id VARCHAR(255),
        action_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'REQUESTED',
        error_details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

-- Source table: experiences

CREATE TABLE IF NOT EXISTS experiences (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      destination VARCHAR(255) NOT NULL,
      departure_location VARCHAR(255) NOT NULL,
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL,
      price DECIMAL NOT NULL,
      total_spots INT NOT NULL,
      available_spots INT NOT NULL,
      itinerary JSONB DEFAULT '[]'::jsonb,
      includes JSONB DEFAULT '[]'::jsonb,
      image_urls JSONB DEFAULT '[]'::jsonb,
      target_audience VARCHAR(50) DEFAULT 'all',
      host_id INT REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'upcoming',
      places_to_visit JSONB DEFAULT '[]'::jsonb,
      included_stay JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: host_meta_identities

CREATE TABLE IF NOT EXISTS host_meta_identities (
      id SERIAL PRIMARY KEY,
      host_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meta_ad_account_id VARCHAR(255),
      meta_page_id VARCHAR(255),
      meta_ig_account_id VARCHAR(255),
      connection_status VARCHAR(50) DEFAULT 'unlinked',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: host_outreach_leads

CREATE TABLE IF NOT EXISTS host_outreach_leads (
      id SERIAL PRIMARY KEY,
      campaign_id INT,
      host_id INT,
      guest_name VARCHAR(255),
      guest_email VARCHAR(255),
      guest_phone VARCHAR(50),
      message_history JSONB DEFAULT '[]'::jsonb,
      property_name VARCHAR(255),
      instagram_username VARCHAR(100),
      facebook_url VARCHAR(255),
      owner_name VARCHAR(100),
      location VARCHAR(255),
      estimated_nightly_rate INT,
      status VARCHAR(50) DEFAULT 'discovered',
      notes TEXT,
      last_contacted_at TIMESTAMP,
      email VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: host_social_posts

CREATE TABLE IF NOT EXISTS host_social_posts (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      media_type VARCHAR(50) DEFAULT 'post', -- 'post', 'reel', 'story', 'carousel'
      media_urls JSONB DEFAULT '[]'::jsonb,
      hero_index INT DEFAULT 0,
      caption TEXT,
      hashtags JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'pending_approval', 'approved', 'rejected'
      admin_feedback TEXT,
      scheduled_at TIMESTAMP,
      published_at TIMESTAMP,
      is_boosted BOOLEAN DEFAULT false,
      boosted_campaign_id INT, -- links to host_marketing_campaigns
      likes INT DEFAULT 0,
      comments INT DEFAULT 0,
      shares INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: host_wallets

CREATE TABLE IF NOT EXISTS host_wallets (
      id SERIAL PRIMARY KEY,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      balance DECIMAL DEFAULT 0,
      encho_credits DECIMAL DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'USD',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(host_id)
    );

-- Source table: lead_inquiries

CREATE TABLE IF NOT EXISTS lead_inquiries (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_name VARCHAR(255),
      lead_source VARCHAR(50),
      lead_intent_score VARCHAR(20) DEFAULT 'COLD',
      masked_contact_info TEXT,
      raw_inquiry TEXT,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: lead_lifecycle_events

CREATE TABLE IF NOT EXISTS lead_lifecycle_events (
        id SERIAL PRIMARY KEY,
        lead_id INT REFERENCES host_outreach_leads(id) ON DELETE CASCADE,
        campaign_id INT,
        host_id INT,
        event_type VARCHAR(100) NOT NULL,
        from_state VARCHAR(50),
        to_state VARCHAR(50),
        actor_type VARCHAR(50) NOT NULL,
        actor_id VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

-- Source table: lead_notification_intents

CREATE TABLE IF NOT EXISTS lead_notification_intents (
        id SERIAL PRIMARY KEY,
        lead_id INT REFERENCES host_outreach_leads(id) ON DELETE CASCADE,
        campaign_id INT,
        host_id INT NOT NULL,
        channel VARCHAR(50) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        metadata JSONB,
        status VARCHAR(50) DEFAULT 'PENDING',
        attempt_count INT DEFAULT 0,
        max_attempts INT DEFAULT 3,
        lease_expires_at TIMESTAMP WITH TIME ZONE,
        next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

-- Source table: lead_security_audit_logs

CREATE TABLE IF NOT EXISTS lead_security_audit_logs (
        id SERIAL PRIMARY KEY,
        lead_id INT,
        campaign_id INT,
        attempted_host_id INT,
        actual_host_id INT,
        action VARCHAR(100) NOT NULL,
        severity VARCHAR(50) DEFAULT 'WARNING',
        reason TEXT NOT NULL,
        client_ip VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

-- Source table: ledger_entries

CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_ref VARCHAR(255) UNIQUE NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: wallet_accounts

CREATE TABLE IF NOT EXISTS wallet_accounts (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      account_type VARCHAR(50) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      balance NUMERIC(15, 2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: ledger_lines

CREATE TABLE IF NOT EXISTS ledger_lines (
      id SERIAL PRIMARY KEY,
      entry_id UUID REFERENCES ledger_entries(id) ON DELETE CASCADE,
      account_id INT REFERENCES wallet_accounts(id) ON DELETE CASCADE,
      entry_type VARCHAR(10) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: messages

CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      booking_id INT REFERENCES bookings(id) ON DELETE CASCADE,
      sender_id INT REFERENCES users(id),
      receiver_id INT REFERENCES users(id),
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: meta_api_traces

CREATE TABLE IF NOT EXISTS meta_api_traces (
      id SERIAL PRIMARY KEY,
      correlation_id VARCHAR(255) NOT NULL,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      host_id INTEGER REFERENCES users(id),
      step VARCHAR(255) NOT NULL,
      endpoint VARCHAR(1000),
      request_payload JSONB,
      response_payload JSONB,
      http_status INTEGER,
      fbtrace_id VARCHAR(255),
      meta_error_code INTEGER,
      meta_error_subcode INTEGER,
      meta_error_message TEXT,
      meta_error_type VARCHAR(255),
      meta_error_is_transient BOOLEAN,
      meta_error_user_title TEXT,
      meta_error_user_msg TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

-- Source table: meta_external_truth

CREATE TABLE IF NOT EXISTS meta_external_truth (
      id SERIAL PRIMARY KEY,
      campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE UNIQUE,
      object_exists BOOLEAN DEFAULT false,
      object_owned_by_master_account BOOLEAN DEFAULT false,
      object_verified BOOLEAN DEFAULT false,
      meta_status VARCHAR(50),
      meta_effective_status VARCHAR(50),
      meta_review_status VARCHAR(50),
      external_status_verified_at TIMESTAMP,
      external_status_verification_source VARCHAR(100)
    );

-- Source table: meta_publishing_transactions

CREATE TABLE IF NOT EXISTS meta_publishing_transactions (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      idempotency_key VARCHAR(255) UNIQUE NOT NULL,
      correlation_id VARCHAR(255) NOT NULL,
      publish_status VARCHAR(50) DEFAULT 'PENDING',
      publish_attempt INTEGER DEFAULT 1,
      meta_campaign_id VARCHAR(255),
      meta_adset_id VARCHAR(255),
      meta_creative_id VARCHAR(255),
      meta_ad_id VARCHAR(255),
      failure_code VARCHAR(100),
      failure_category VARCHAR(100),
      failure_stage VARCHAR(100),
      rollback_status VARCHAR(50),
      error_details JSONB,
      reconciliation_lease_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

-- Source table: meta_publishing_dlq

CREATE TABLE IF NOT EXISTS meta_publishing_dlq (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      correlation_id VARCHAR(255) NOT NULL,
      failure_stage VARCHAR(50) NOT NULL,
      failure_code VARCHAR(100),
      requires_human_action BOOLEAN DEFAULT true,
      error_payload JSONB,
      retry_count INTEGER DEFAULT 0,
      recommended_action TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );

-- Source table: meta_publishing_events

CREATE TABLE IF NOT EXISTS meta_publishing_events (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES meta_publishing_transactions(id),
      campaign_id INTEGER REFERENCES host_marketing_campaigns(id),
      event_type VARCHAR(100) NOT NULL,
      from_state VARCHAR(50),
      to_state VARCHAR(50) NOT NULL,
      actor_type VARCHAR(50) DEFAULT 'system',
      actor_id VARCHAR(100),
      reason TEXT,
      correlation_id VARCHAR(255),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );

-- Source table: operation_idempotency_keys

CREATE TABLE IF NOT EXISTS operation_idempotency_keys (
      id SERIAL PRIMARY KEY,
      campaign_id INT NOT NULL,
      operation_type VARCHAR(100) NOT NULL,
      idempotency_key VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, operation_type, idempotency_key)
    );

-- Source table: provider_entities

CREATE TABLE IF NOT EXISTS provider_entities (
        id SERIAL PRIMARY KEY,
        campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        external_id VARCHAR(255) NOT NULL,
        parent_entity_id VARCHAR(255),
        account_id VARCHAR(255),
        configured_status VARCHAR(50) DEFAULT 'ACTIVE',
        effective_status VARCHAR(50) DEFAULT 'ACTIVE',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_provider_entity_external_id UNIQUE (provider, external_id)
      );

-- Source table: provider_publishing_transactions

CREATE TABLE IF NOT EXISTS provider_publishing_transactions (
        id SERIAL PRIMARY KEY,
        campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        operation_type VARCHAR(100) NOT NULL,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        correlation_id VARCHAR(255),
        publish_status VARCHAR(50) DEFAULT 'REQUESTED',
        external_campaign_id VARCHAR(255),
        external_container_id VARCHAR(255),
        external_ad_id VARCHAR(255),
        external_creative_id VARCHAR(255),
        payload JSONB,
        response JSONB,
        error_details TEXT,
        attempt_count INT DEFAULT 1,
        lease_expires_at TIMESTAMP WITH TIME ZONE,
        is_unknown_outcome BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

-- Source table: threads

CREATE TABLE IF NOT EXISTS threads (
      id SERIAL PRIMARY KEY,
      listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
      guest_id INT REFERENCES users(id) ON DELETE CASCADE,
      host_id INT REFERENCES users(id) ON DELETE CASCADE,
      last_message TEXT,
      unread_count_guest INT DEFAULT 0,
      unread_count_host INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      experience_id INT REFERENCES experiences(id) ON DELETE CASCADE,
      UNIQUE(listing_id, guest_id),
      UNIQUE(experience_id, guest_id)
    );

-- Source table: variant_daily_rollups

CREATE TABLE IF NOT EXISTS variant_daily_rollups (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        impressions BIGINT DEFAULT 0,
        clicks BIGINT DEFAULT 0,
        conversions BIGINT DEFAULT 0,
        spend_usd NUMERIC(12,4) DEFAULT 0.0000,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(variant_id, date)
      );

-- Source table: variant_meta_snapshots

CREATE TABLE IF NOT EXISTS variant_meta_snapshots (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        last_meta_impressions BIGINT DEFAULT 0,
        last_meta_clicks BIGINT DEFAULT 0,
        last_meta_conversions BIGINT DEFAULT 0,
        last_meta_spend NUMERIC(12,4) DEFAULT 0.0000,
        last_meta_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        snapshot_version INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(variant_id)
      );

-- Source table: variant_raw_event_logs

CREATE TABLE IF NOT EXISTS variant_raw_event_logs (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES campaign_creative_variants(id) ON DELETE CASCADE,
        meta_ad_id VARCHAR(255),
        snapshot_before_version INTEGER NOT NULL DEFAULT 0,
        snapshot_after_version INTEGER NOT NULL DEFAULT 1,
        impressions_delta BIGINT DEFAULT 0,
        clicks_delta BIGINT DEFAULT 0,
        conversions_delta BIGINT DEFAULT 0,
        spend_delta NUMERIC(12,4) DEFAULT 0.0000,
        is_correction BOOLEAN NOT NULL DEFAULT false,
        observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        source_snapshot_reference VARCHAR(255),
        CONSTRAINT unique_variant_version_transition UNIQUE (variant_id, snapshot_before_version, snapshot_after_version)
      );

-- Source table: wallet_transactions

CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      wallet_id INT REFERENCES host_wallets(id) ON DELETE CASCADE,
      amount DECIMAL NOT NULL,
      type VARCHAR(50) NOT NULL,
      reference_id VARCHAR(255) UNIQUE,
      status VARCHAR(50) DEFAULT 'completed',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- Source table: webhook_dlq

CREATE TABLE IF NOT EXISTS webhook_dlq (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      error_message TEXT,
      retry_count INT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_locations TEXT;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_locations_json JSONB;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_radius_km INT DEFAULT 50;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ad_format VARCHAR(50) DEFAULT 'post';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS feed_description TEXT;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS rejected_fields JSONB DEFAULT '{}'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS external_status_verified_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS external_status_verification_source VARCHAR(100);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS insights_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_status VARCHAR(50);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_effective_status VARCHAR(50);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_review_status VARCHAR(50);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT false;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_campaign_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_adset_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_creative_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_dispatched_at TIMESTAMP;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_capi_token TEXT;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_lead_form_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS google_conversion_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS google_conversion_label VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pacing_mode VARCHAR(50) DEFAULT 'standard';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_spent DECIMAL DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS spent DECIMAL DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_impressions INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_clicks INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS encho_absorbed_overspend DECIMAL DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_conversions INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(50) DEFAULT 'released';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS escrow_release_at TIMESTAMP;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS three_d_secure_verified BOOLEAN DEFAULT true;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS optimization_fee DECIMAL DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ad_spend_pool DECIMAL DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS last_pacing_calc_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS target_audience_persona VARCHAR(50) DEFAULT 'everyone';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS audience_interests JSONB DEFAULT '[]'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ai_generated_ad_copies JSONB DEFAULT '{}'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS ad_medias JSONB DEFAULT '[]'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS adset_specifications JSONB DEFAULT '{}'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_specifications JSONB DEFAULT '{}'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS meta_sync_logs JSONB DEFAULT '{}'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS approval_snapshot JSONB;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS approval_hash VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS reach INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS reactions_count INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS shares_count INT;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_source_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_source VARCHAR(50);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_reason TEXT;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor VARCHAR(50);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS pause_actor_id VARCHAR(100);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS last_calendar_event_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS campaign_id INT;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS host_id INT;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(50);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS message_history JSONB DEFAULT '[]'::jsonb;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS intent_score INT DEFAULT 50;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS ai_intent_badge VARCHAR(50) DEFAULT 'WARM_INQUIRY';

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS detected_audience_persona VARCHAR(50) DEFAULT 'couples_family';

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS masked_contact BOOLEAN DEFAULT true;

ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS available_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;

ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;

ALTER TABLE async_webhook_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS property_name VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(100);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS location VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS estimated_nightly_rate INT;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'discovered';

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS lead_source VARCHAR(255) DEFAULT 'organic';

ALTER TABLE threads ADD COLUMN IF NOT EXISTS campaign_id INT REFERENCES host_marketing_campaigns(id) ON DELETE SET NULL;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS lead_intent_score VARCHAR(50) DEFAULT 'neutral';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_sanitized BOOLEAN DEFAULT false;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_lease_expires_at TIMESTAMP;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INT DEFAULT 0;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_category VARCHAR(100);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(100);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(50);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS error_details JSONB;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_category VARCHAR(100);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(100);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(50);

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS error_details JSONB;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(255);

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS host_id INTEGER REFERENCES users(id);

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS step VARCHAR(255);

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS endpoint VARCHAR(1000);

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS request_payload JSONB;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS response_payload JSONB;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS http_status INTEGER;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS fbtrace_id VARCHAR(255);

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_code INTEGER;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_subcode INTEGER;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_message TEXT;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_type VARCHAR(255);

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_is_transient BOOLEAN;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_title TEXT;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS meta_error_user_msg TEXT;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

ALTER TABLE meta_api_traces ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE meta_publishing_dlq ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);

ALTER TABLE meta_publishing_dlq ADD COLUMN IF NOT EXISTS requires_human_action BOOLEAN DEFAULT true;

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS hero_index INT DEFAULT 0;

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '[]'::jsonb;

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS external_media_id VARCHAR(255);

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS provider_creation_id VARCHAR(255);

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS publish_attempt_count INT DEFAULT 0;

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS owner_meta_ad_account_id VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS policy_cleared BOOLEAN DEFAULT false;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS policy_cleared_at TIMESTAMP;

ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS variant_activated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';

ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);

ALTER TABLE campaign_creative_variants ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_impressions BIGINT DEFAULT 0;

ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_clicks BIGINT DEFAULT 0;

ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_conversions BIGINT DEFAULT 0;

ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_spend NUMERIC(12,4) DEFAULT 0.0000;

ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS last_meta_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE variant_meta_snapshots ADD COLUMN IF NOT EXISTS snapshot_version INTEGER DEFAULT 1;

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS loser_variant_id INTEGER REFERENCES campaign_creative_variants(id) ON DELETE SET NULL;

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS winner_metric_value NUMERIC(12,4);

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS loser_metric_value NUMERIC(12,4);

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS relative_advantage NUMERIC(8,4);

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS decision VARCHAR(50);

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS optimization_metric VARCHAR(50) DEFAULT 'CPC';

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS evaluation_window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS evaluation_window_end TIMESTAMP WITH TIME ZONE;

ALTER TABLE dco_evaluation_transactions ADD COLUMN IF NOT EXISTS metrics_snapshot JSONB DEFAULT '{}';

ALTER TABLE dco_external_actions ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(255);

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS snapshot_before_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS snapshot_after_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS impressions_delta BIGINT DEFAULT 0;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS clicks_delta BIGINT DEFAULT 0;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS conversions_delta BIGINT DEFAULT 0;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS spend_delta NUMERIC(12,4) DEFAULT 0.0000;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS is_correction BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE variant_raw_event_logs ADD COLUMN IF NOT EXISTS source_snapshot_reference VARCHAR(255);

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS dco_status VARCHAR(50) DEFAULT 'PENDING_DATA';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS objective VARCHAR(50) DEFAULT 'TRAFFIC';

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS optimization_metric VARCHAR(50) DEFAULT 'CPC';

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS source VARCHAR(255) DEFAULT 'Meta Advertising Webhook';

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS listing_id INT;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'META';

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS external_lead_id VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS form_id VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS ad_id VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS scoring_inputs JSONB;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS scored_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS lost_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS thread_id INT;

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(255);

ALTER TABLE host_outreach_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE webhook_dlq ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP;

ALTER TABLE host_social_posts ADD COLUMN IF NOT EXISTS publish_attempt_count INT DEFAULT 0;

ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS dco_last_evaluated_at TIMESTAMP;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS quarantined_objects JSONB;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMP;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_started_at TIMESTAMP;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS reconciliation_attempt_count INTEGER DEFAULT 0;

ALTER TABLE meta_publishing_transactions ADD COLUMN IF NOT EXISTS next_reconciliation_at TIMESTAMP;

-- Additive compatibility for existing MetaTelemetrySyncEngine readers/writers.
-- No observation is inferred or backfilled. Rollback keeps nullable evidence columns.
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS telemetry_source_metadata JSONB;
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_synced_at TIMESTAMPTZ;
ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS engagement_source_metadata JSONB;

-- Existing bootstrap DO-block additions (server.ts ensure tables); pg-mem cannot execute DO.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id INT REFERENCES threads(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS listing_id INT REFERENCES listings(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS processed_payments (
  id SERIAL PRIMARY KEY, razorpay_payment_id VARCHAR(255), razorpay_order_id VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE, type VARCHAR(50), reference_id VARCHAR(255) UNIQUE,
  payment_gateway VARCHAR(50), amount DECIMAL DEFAULT 0, currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
