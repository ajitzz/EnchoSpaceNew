import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function generateReport() {
    const campaignId = 1;
    let report = `RECONCILIATION REPORT FOR CAMPAIGN #1\n=========================================\n\n`;

    const campRes = await pool.query('SELECT * FROM host_marketing_campaigns WHERE id = $1', [campaignId]);
    if (campRes.rows.length === 0) {
        report += 'Campaign #1 not found.\n';
        fs.writeFileSync('campaign_1_reconciliation_report.txt', report);
        process.exit(0);
    }
    const camp = campRes.rows[0];
    report += `campaign_id: ${camp.id}\n`;
    report += `campaign status: ${camp.status}\n`;
    report += `escrow status: ${camp.escrow_status}\n`;
    report += `payment status: ${camp.payment_status}\n`;
    report += `Meta object IDs: campaign_id=${camp.meta_campaign_id}, adset_id=${camp.meta_adset_id}, ad_id=${camp.meta_ad_id}\n\n`;

    const walletRes = await pool.query('SELECT * FROM wallet_transactions WHERE wallet_id = (SELECT id FROM host_wallets WHERE host_id = $1) ORDER BY created_at DESC', [camp.host_id]);
    report += `Wallet Transactions:\n`;
    walletRes.rows.forEach(w => {
        report += ` - ID: ${w.id}, Amount: ${w.amount}, Type: ${w.type}, Status: ${w.status}, Desc: ${w.description}\n`;
    });
    report += '\n';

    const txRes = await pool.query('SELECT * FROM meta_publishing_transactions WHERE campaign_id = $1 ORDER BY created_at DESC', [campaignId]);
    report += `Publishing Transactions:\n`;
    txRes.rows.forEach(tx => {
        report += ` - ID: ${tx.id}, Status: ${tx.status}, Action: ${tx.action_type}, Error: ${tx.error_details ? JSON.stringify(tx.error_details) : 'None'}\n`;
    });
    report += '\n';

    const auditRes = await pool.query('SELECT * FROM admin_audit_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC', ['campaign_escrow', campaignId.toString()]);
    report += `Admin Audit Entries for Escrow Release:\n`;
    report += `Number of escrow-release attempts: ${auditRes.rows.length}\n`;
    auditRes.rows.forEach(a => {
        report += ` - Action: ${a.action}, Admin: ${a.admin_id}, Date: ${a.created_at}\n`;
    });
    report += '\n';

    const rollbackRes = await pool.query('SELECT * FROM admin_audit_logs WHERE entity_type = $1 AND entity_id = $2 AND action LIKE $3 ORDER BY created_at DESC', ['meta_campaign', campaignId.toString(), '%rollback%']);
    report += `Rollback Status:\n`;
    rollbackRes.rows.forEach(a => {
        report += ` - Action: ${a.action}, Status/Changes: ${JSON.stringify(a.new_state)}\n`;
    });
    report += '\n';

    const tracesRes = await pool.query('SELECT * FROM meta_api_traces WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 5', [campaignId]);
    report += `Correlation IDs (from recent API traces):\n`;
    tracesRes.rows.forEach(t => {
        report += ` - Correlation: ${t.correlation_id}, Method: ${t.method}, Endpoint: ${t.endpoint}, Status: ${t.status_code}\n`;
    });

    fs.writeFileSync('campaign_1_reconciliation_report.txt', report);
    console.log('Report generated.');
    process.exit(0);
}

generateReport().catch(console.error);
