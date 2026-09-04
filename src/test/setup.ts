import { enforceTestDatabaseSafety } from './db_safety';
enforceTestDatabaseSafety();
import '@testing-library/jest-dom';

import { vi } from 'vitest';

vi.mock('pg', async (importOriginal) => {
  const { newDb } = await import('pg-mem');
  const db = newDb();

  // Fix pg-mem DECIMAL(10,2) AST bug by intercepting queries
  (db.public as any).interceptQueries((queryText: string) => {
    if (queryText.includes('DECIMAL(10, 2)')) {
      return queryText.replace(/DECIMAL\(10,\s*2\)/g, 'FLOAT');
    }
    return null;
  });

  // Seed essential schema for FSM and reconciliation tests
  db.public.none(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      google_id VARCHAR(255) UNIQUE,
      role VARCHAR(50) DEFAULT 'user',
      wallet_balance FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE listings_drafts (
      id SERIAL PRIMARY KEY,
      published_listing_id INTEGER,
      status VARCHAR(50) DEFAULT 'DRAFT'
    );
    CREATE TABLE meta_publishing_events (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER,
      event_type VARCHAR(50),
      status VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE campaigns (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      user_id INTEGER,
      status VARCHAR(50),
      budget FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE campaign_metrics (
      campaign_id INTEGER,
      date DATE,
      impressions INTEGER,
      clicks INTEGER,
      spend FLOAT,
      leads INTEGER
    );
    CREATE TABLE inbound_webhooks (
      webhook_id SERIAL PRIMARY KEY,
      provider VARCHAR(50),
      event_type VARCHAR(100),
      payload JSONB,
      status VARCHAR(50),
      attempts INTEGER DEFAULT 0,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      next_retry_at TIMESTAMP,
      error_state TEXT,
      processed_at TIMESTAMP
    );
    CREATE TABLE bookings (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER,
      user_id INTEGER,
      status VARCHAR(50),
      total_price FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const { Pool, Client } = db.adapters.createPg();
  return {
    default: { Pool, Client },
    Pool,
    Client,
  };
});


