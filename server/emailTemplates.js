export function renderPowderBriefingEmail({ top3, bestBet, weekendOutlook }) {
  const resortRow = (r) => `
    <tr>
      <td style="padding:8px 0;font-weight:700;color:#e0f2fe;">${r.name}</td>
      <td style="padding:8px 0;color:#38bdf8;font-weight:800;">${r.powderScore != null ? Math.round(r.powderScore) : "—"} · ${r.powderTier}</td>
    </tr>`

  return `
  <div style="background:#04080f;color:#e0f2fe;font-family:sans-serif;padding:24px;max-width:520px;margin:0 auto;">
    <div style="font-size:20px;font-weight:900;color:#38bdf8;">❄️ PowderDays — Wednesday Briefing</div>
    <p style="color:#7dd3fc;font-size:14px;">Here's where the snow is this weekend.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      ${(top3 || []).map(resortRow).join("")}
    </table>
    ${bestBet ? `<div style="margin-top:20px;padding:14px;background:rgba(56,189,248,0.1);border-radius:12px;">
      <strong>🏆 Best Bet: ${bestBet.name}</strong><br/>
      <span style="font-size:13px;color:#7dd3fc;">${bestBet.reason || "Highest powder score this week."}</span>
    </div>` : ""}
    ${weekendOutlook ? `<p style="margin-top:16px;font-size:13px;color:#7dd3fc;">${weekendOutlook}</p>` : ""}
    <p style="margin-top:24px;font-size:12px;color:#334155;">
      <a href="{{UNSUBSCRIBE_URL}}" style="color:#334155;">Unsubscribe</a> from weekly powder briefings.
    </p>
  </div>`
}
