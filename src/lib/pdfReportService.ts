/**
 * ENCHO Phase 3.5: PDF Report Generator Service
 *
 * Implements authoritative PDF generation for Campaign Performance Reports.
 * Ensures 100% mathematical and structural consistency by querying the exact
 * same `PerformanceAnalyticsService` projection used by the live UI.
 */

import pg from 'pg';
import { PerformanceAnalyticsService, CampaignPerformanceReport, ViewerContext, TimeWindow } from './performanceAnalyticsService.js';

export class PdfReportService {
  /**
   * Generates a structured vector HTML/printable document representation of the Campaign Performance Report.
   * Can be rendered directly in-browser, printed, or saved as PDF.
   */
  public static async generateCampaignReportHtml(
    campaignId: number | string,
    viewerContext: ViewerContext,
    options: {
      window?: TimeWindow;
      customStart?: string;
      customEnd?: string;
    } = {},
    pool: pg.Pool
  ): Promise<{ html: string; report: CampaignPerformanceReport }> {
    const report = await PerformanceAnalyticsService.getCampaignPerformanceReport(
      campaignId,
      viewerContext,
      options,
      pool
    );

    const m = report.metrics;
    const f = report.financials;
    const d = report.delivery_truth;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ENCHO Performance Report — ${escapeHtml(report.campaign_title)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .brand {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #0f172a;
    }
    .brand span { color: #f43f5e; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-live { background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-paused { background-color: #fef9c3; color: #a16207; border: 1px solid #fde047; }
    .badge-fresh { background-color: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
    
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .meta-item label {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .meta-item div {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }

    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 16px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }
    .metric-card .val {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .metric-card .lbl {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .table th {
      background-color: #f1f5f9;
      text-align: left;
      padding: 10px 12px;
      font-weight: 700;
      color: #475569;
      border-bottom: 2px solid #cbd5e1;
    }
    .table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .table tr:last-child td { border-bottom: none; }

    .funnel-bar {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .funnel-label { width: 160px; font-size: 12px; font-weight: 600; color: #334155; }
    .funnel-progress {
      flex: 1;
      height: 20px;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
      margin-right: 12px;
    }
    .funnel-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 4px;
    }
    .funnel-count { width: 70px; text-align: right; font-size: 12px; font-weight: 700; }
    .funnel-rate { width: 80px; text-align: right; font-size: 11px; color: #64748b; }

    .insight-card {
      background: #f8fafc;
      border-left: 4px solid #3b82f6;
      padding: 12px 16px;
      margin-bottom: 10px;
      border-radius: 0 6px 6px 0;
    }
    .insight-card.warning { border-left-color: #f59e0b; }
    .insight-card.critical { border-left-color: #ef4444; }
    .insight-fact { font-weight: 700; font-size: 13px; margin-bottom: 4px; color: #1e293b; }
    .insight-action { font-size: 12px; color: #475569; }

    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">ENCHO<span>.</span> Marketing Intelligence</div>
      <div style="font-size: 18px; font-weight: 800; margin-top: 6px;">${escapeHtml(report.campaign_title)}</div>
      <div style="font-size: 13px; color: #64748b;">${escapeHtml(report.listing_title)} (ID #${report.listing_id})</div>
    </div>
    <div style="text-align: right;">
      <span class="badge ${d.is_live ? 'badge-live' : 'badge-paused'}">${escapeHtml(d.operational_label)}</span>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Meta ID: ${escapeHtml(d.meta_campaign_id || 'N/A')}</div>
      <div style="font-size: 11px; color: #64748b;">Freshness: <strong>${escapeHtml(report.freshness.overall)}</strong></div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <label>Report Window</label>
      <div>${escapeHtml(report.window)} (${escapeHtml(report.start_date)} to ${escapeHtml(report.end_date)})</div>
    </div>
    <div class="meta-item">
      <label>Authorized Ad Budget</label>
      <div>$${f.meta_authorized_spend.toFixed(2)} ${f.currency}</div>
    </div>
    <div class="meta-item">
      <label>Actual Ad Spend</label>
      <div>$${f.meta_actual_spend.toFixed(2)} (${f.budget_utilization_pct}%)</div>
    </div>
    <div class="meta-item">
      <label>Remaining Authorization</label>
      <div>$${f.meta_remaining_authorization.toFixed(2)} ${f.currency}</div>
    </div>
  </div>

  <div class="section-title">1. Executive Performance Metrics</div>
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="val">${m.impressions.value.toLocaleString()}</div>
      <div class="lbl">Impressions</div>
    </div>
    <div class="metric-card">
      <div class="val">${m.reach.value.toLocaleString()}</div>
      <div class="lbl">Reach</div>
    </div>
    <div class="metric-card">
      <div class="val">${m.clicks.value.toLocaleString()}</div>
      <div class="lbl">Clicks</div>
    </div>
    <div class="metric-card">
      <div class="val">${(m.ctr.value * 100).toFixed(2)}%</div>
      <div class="lbl">CTR</div>
    </div>
    <div class="metric-card">
      <div class="val">$${m.cpc.value.toFixed(2)}</div>
      <div class="lbl">Avg CPC</div>
    </div>
    <div class="metric-card">
      <div class="val">$${m.cpm.value.toFixed(2)}</div>
      <div class="lbl">CPM</div>
    </div>
    <div class="metric-card">
      <div class="val">${m.leads.value}</div>
      <div class="lbl">Leads Captured</div>
    </div>
    <div class="metric-card">
      <div class="val">${m.conversions.value}</div>
      <div class="lbl">Bookings</div>
    </div>
  </div>

  <div class="section-title">2. Full-Funnel Conversion Intelligence</div>
  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    ${report.funnel.stages.map((stage) => {
      const pctFromTop = stage.conversion_rate_from_top !== null ? Math.max(2, Math.min(100, stage.conversion_rate_from_top * 100)) : 100;
      return `
      <div class="funnel-bar">
        <div class="funnel-label">${escapeHtml(stage.label)}</div>
        <div class="funnel-progress">
          <div class="funnel-fill" style="width: ${pctFromTop}%;"></div>
        </div>
        <div class="funnel-count">${stage.count.toLocaleString()}</div>
        <div class="funnel-rate">${stage.conversion_rate_from_previous !== null ? (stage.conversion_rate_from_previous * 100).toFixed(1) + '%' : '100%'}</div>
      </div>`;
    }).join('')}
  </div>

  <div class="section-title">3. Dynamic Creative Optimization (DCO) Variant Matrix</div>
  <table class="table">
    <thead>
      <tr>
        <th>Variant</th>
        <th>Status</th>
        <th>Impressions</th>
        <th>Clicks</th>
        <th>CTR</th>
        <th>Spend</th>
        <th>CPC</th>
      </tr>
    </thead>
    <tbody>
      ${report.variants.map(v => `
      <tr>
        <td><strong>${escapeHtml(v.headline)}</strong> ${v.is_winner ? '<span class="badge badge-live">WINNER</span>' : ''}</td>
        <td>${escapeHtml(v.dco_decision || 'ACTIVE')}</td>
        <td>${v.impressions.toLocaleString()}</td>
        <td>${v.clicks.toLocaleString()}</td>
        <td>${(v.ctr * 100).toFixed(2)}%</td>
        <td>$${v.spend.toFixed(2)}</td>
        <td>$${v.cpc.toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="section-title">4. Strategic Insights & Operational Recommendations</div>
  <div>
    ${report.host_insights.map(item => `
      <div class="insight-card ${item.type === 'WARNING' ? 'warning' : ''}">
        <div class="insight-fact">${escapeHtml(item.observed_fact)}</div>
        <div class="insight-action"><strong>Recommended Action:</strong> ${escapeHtml(item.recommended_action)}</div>
      </div>
    `).join('')}
    ${report.anomalies.map(anom => `
      <div class="insight-card ${anom.severity === 'CRITICAL' ? 'critical' : 'warning'}">
        <div class="insight-fact">🚨 ${escapeHtml(anom.title)}: ${escapeHtml(anom.description)}</div>
        <div class="insight-action"><strong>Observed:</strong> ${escapeHtml(String(anom.observed_value))} (Threshold: ${escapeHtml(anom.threshold)}) — <strong>Remediation:</strong> ${escapeHtml(anom.recommended_action)}</div>
      </div>
    `).join('')}
  </div>

  <div class="footer">
    <div>Generated: ${new Date(report.generated_at).toUTCString()} | Data Source: Meta Ads Insights API</div>
    <div>ENCHO Advertising OS • FAANG Standard Financial & Delivery Truth</div>
  </div>
</body>
</html>`;

    return { html, report };
  }
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
