import nodemailer from "nodemailer";

import {
  ALERT_EMAIL_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "../config.js";
import type { DailyDigestPayload } from "./monitorTypes.ts";
import type { MonitorNotifier } from "./notifier.ts";

function buildDigestText(payload: DailyDigestPayload): string {
  const lines = [
    `Stock dip alert digest for ${payload.digestDate}`,
    "",
    ...payload.alerts.map((alert, index) => {
      const priceLine = `Current: ${alert.latestPrice.toFixed(2)} | Baseline: ${alert.baselinePrice.toFixed(2)} | Dip: ${alert.dipPercent.toFixed(2)}% | Threshold: ${alert.thresholdPercent.toFixed(2)}%`;
      return `${index + 1}. ${alert.symbol}\n   ${priceLine}\n   ${alert.reason}`;
    }),
  ];

  return lines.join("\n");
}

function buildDigestHtml(payload: DailyDigestPayload): string {
  const rows = payload.alerts
    .map((alert) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #d6dfef;font-weight:700;">${alert.symbol}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #d6dfef;">${alert.latestPrice.toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #d6dfef;">${alert.baselinePrice.toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #d6dfef;">${alert.dipPercent.toFixed(2)}%</td>
        <td style="padding:10px 12px;border-bottom:1px solid #d6dfef;">${alert.thresholdPercent.toFixed(2)}%</td>
      </tr>
    `)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#10233f;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Stock dip alert digest</h2>
      <p style="margin:0 0 16px;">Daily summary for ${payload.digestDate}.</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;background:#ffffff;">
        <thead>
          <tr style="background:#eff5ff;">
            <th style="padding:10px 12px;text-align:left;">Symbol</th>
            <th style="padding:10px 12px;text-align:left;">Current</th>
            <th style="padding:10px 12px;text-align:left;">Baseline</th>
            <th style="padding:10px 12px;text-align:left;">Dip</th>
            <th style="padding:10px 12px;text-align:left;">Threshold</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export class EmailDigestNotifier implements MonitorNotifier {
  #transporter = SMTP_HOST && ALERT_EMAIL_FROM
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      })
    : null;

  async notifyDailyDigest(payload: DailyDigestPayload): Promise<void> {
    if (!payload.recipientEmail) {
      return;
    }

    if (!this.#transporter || !ALERT_EMAIL_FROM) {
      console.warn("Daily digest email skipped because SMTP transport is not fully configured.");
      return;
    }

    await this.#transporter.sendMail({
      from: ALERT_EMAIL_FROM,
      to: payload.recipientEmail,
      subject: `Stock dip alert digest for ${payload.digestDate}`,
      text: buildDigestText(payload),
      html: buildDigestHtml(payload),
    });
  }
}