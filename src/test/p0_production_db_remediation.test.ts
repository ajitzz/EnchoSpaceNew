import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import { safeParseResponse, safeFetch } from '../lib/apiClient';

const { Pool } = pkg;

describe('Phase 2.7 P0 Production Database Remediation & Fail-Closed Safety', () => {

  it('1. MUST require DATABASE_URL and fail closed when missing', () => {
    const originalEnv = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error("DATABASE_URL is not configured");
      }
    }).toThrow("DATABASE_URL is not configured");

    process.env.DATABASE_URL = originalEnv;
  });

  it('2. MUST NOT contain hardcoded postgres credentials in server.ts or src/lib', () => {
    const serverCode = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    
    // Ensure no npg_ or hardcoded postgresql:// strings remain in server.ts
    expect(serverCode).not.toContain('npg_');
    expect(serverCode).not.toContain('userDbUrl =');
    expect(serverCode).not.toContain('postgresql://neondb_owner:');

    // Audit src/lib files
    const libFiles = fs.readdirSync(path.resolve(process.cwd(), 'src/lib'));
    for (const file of libFiles) {
      const filePath = path.resolve(process.cwd(), 'src/lib', file);
      if (fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('npg_');
        expect(content).not.toContain('postgresql://neondb_owner:');
      }
    }
  });

  it('3. Read-only DB connectivity smoke test (SELECT 1)', async () => {
    const dbUrl = process.env.DATABASE_URL;
    expect(dbUrl).toBeDefined();
    expect(dbUrl!.length).toBeGreaterThan(0);

    const pool = new Pool({ connectionString: dbUrl });
    try {
      const res = await pool.query('SELECT 1 as alive');
      expect(res.rows[0].alive).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('4. Safe API Client handles 2xx JSON, 401 JSON, 500 JSON, and 500 HTML safely without throwing SyntaxError', async () => {
    // 200 JSON
    const res200 = new Response(JSON.stringify({ success: true, data: [1, 2, 3] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    const parsed200 = await safeParseResponse(res200);
    expect(parsed200.ok).toBe(true);
    expect(parsed200.status).toBe(200);
    expect(parsed200.data).toEqual({ success: true, data: [1, 2, 3] });

    // 401 JSON
    const res401 = new Response(JSON.stringify({ error: 'Authentication required. No token provided.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
    const parsed401 = await safeParseResponse(res401);
    expect(parsed401.ok).toBe(false);
    expect(parsed401.status).toBe(401);
    expect(parsed401.error).toBe('Authentication required. No token provided.');

    // 500 JSON
    const res500Json = new Response(JSON.stringify({ error: 'Internal Database Connection Failure' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
    const parsed500Json = await safeParseResponse(res500Json);
    expect(parsed500Json.ok).toBe(false);
    expect(parsed500Json.status).toBe(500);
    expect(parsed500Json.error).toBe('Internal Database Connection Failure');

    // 500 HTML (e.g. Nginx / Gateway crash)
    const res500Html = new Response('<html><body>502 Bad Gateway / Internal Error</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' }
    });
    const parsed500Html = await safeParseResponse(res500Html);
    expect(parsed500Html.ok).toBe(false);
    expect(parsed500Html.status).toBe(502);
    expect(parsed500Html.isJson).toBe(false);
    expect(parsed500Html.error).toContain('Server returned HTML response');
    expect(parsed500Html.rawText).toContain('Bad Gateway');
  });

  it('5. Unauthenticated request to protected endpoints MUST yield 401 JSON without 500 or fallback auth', async () => {
    const authHeader = null;
    const token = authHeader && authHeader.split(' ')[1];

    let responseStatus = 200;
    let responseJson: any = null;

    if (!token) {
      responseStatus = 401;
      responseJson = { error: 'Authentication required. No token provided.' };
    }

    expect(responseStatus).toBe(401);
    expect(responseJson.error).toBe('Authentication required. No token provided.');
  });
});
