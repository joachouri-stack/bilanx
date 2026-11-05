// Export Apple Santé synthétique (format documenté) : 60 derniers jours, montre + iPhone.
import { strToU8, zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
const pad = (n) => String(n).padStart(2, '0');
const apple = (d) => { const l = new Date(d.getTime() + 3_600_000); return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:${pad(l.getUTCSeconds())} +0100`; };
const rec = (src, a, min, v) => `  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="${src}" unit="count" startDate="${apple(a)}" endDate="${apple(new Date(a.getTime() + min * 60000))}" value="${v}"/>\n`;
let body = '';
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
for (let d = 59; d >= 1; d--) {
  const day = new Date(today.getTime() - d * 86400000);
  for (let h = 7; h <= 20; h++) {
    const a = new Date(day.getTime() + (h - 1) * 3600000 + 10 * 60000);
    const v = 300 + ((d * 7 + h * 13) % 9) * 60;
    body += rec('Apple Watch de Jo', a, 20, v);
    body += rec('iPhone de Jo', new Date(a.getTime() + 120000), 15, Math.round(v * 0.85));
  }
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="fr_FR">\n${body}</HealthData>\n`;
writeFileSync('export.zip', zipSync({ 'apple_health_export/exportation.xml': strToU8(xml), 'apple_health_export/exportation_cda.xml': strToU8('<x/>') }));
console.log('export.zip écrit');
