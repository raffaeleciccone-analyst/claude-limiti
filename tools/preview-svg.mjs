// Renders the real status line output (with sample data) to SVG images for the README.
//   node tools/preview-svg.mjs   ->  docs/preview-en.svg, docs/preview-it.svg
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const now = Math.floor(Date.now() / 1000);

function render(lang) {
  const home = mkdtempSync(join(tmpdir(), 'limiti-preview-'));
  try {
    mkdirSync(join(home, '.claude', 'state'), { recursive: true });
    writeFileSync(join(home, '.claude', 'statusline-limiti.config.json'), JSON.stringify({ language: lang, colors: 'truecolor' }));
    // half an hour ago the 5-hour window was at 30%: fast enough to trigger the forecast
    writeFileSync(join(home, '.claude', 'state', 'limiti-utilizzo.json'), JSON.stringify({ storia: [{ t: now - 1800, h5: 30, r5: now + 5340 }] }));
    const input = JSON.stringify({
      model: { display_name: 'Opus 5.5' }, effort: { level: 'medium' },
      workspace: { current_dir: join(home, 'my-project') }, context_window: { used_percentage: 34 },
      prompt_cache: { expires_at: now + 540 }, cost: { total_duration_ms: 5400000, total_cost_usd: 1.23 },
      rate_limits: { five_hour: { used_percentage: 62, resets_at: now + 5340 }, seven_day: { used_percentage: 18, resets_at: now + 298800 } },
    });
    const r = spawnSync(process.execPath, [join(ROOT, 'limiti', 'statusline.mjs')], {
      input, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, LIMITI_NO_NOTIFICHE: '1', COLUMNS: '140' },
    });
    return r.stdout;
  } finally { rmSync(home, { recursive: true, force: true }); }
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toSvg(ansi) {
  const lines = ansi.split('\n');
  const CW = 8.45, LH = 22, PAD = 18, FS = 14;
  let maxCols = 0;
  const rows = lines.map((line, i) => {
    let color = '#d4d4d8', bold = false, out = '', cols = 0;
    for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
      const m = part.match(/^\x1b\[([0-9;]*)m$/);
      if (m) {
        const p = m[1].split(';').map(Number);
        if (p[0] === 0) { color = '#d4d4d8'; bold = false; }
        else if (p[0] === 1) bold = true;
        else if (p[0] === 38 && p[1] === 2) color = `rgb(${p[2]},${p[3]},${p[4]})`;
        continue;
      }
      if (!part) continue;
      cols += [...part].length;
      out += `<tspan fill="${color}"${bold ? ' font-weight="bold"' : ''}>${esc(part)}</tspan>`;
    }
    maxCols = Math.max(maxCols, cols);
    return `<text x="${PAD}" y="${PAD + 14 + i * LH}" xml:space="preserve">${out}</text>`;
  });
  const w = Math.ceil(PAD * 2 + maxCols * CW), h = PAD * 2 + lines.length * LH - 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', monospace" font-size="${FS}">
<rect width="100%" height="100%" rx="8" fill="#16161c"/>
${rows.join('\n')}
</svg>
`;
}

mkdirSync(join(ROOT, 'docs'), { recursive: true });
for (const lang of ['en', 'it']) {
  const file = join(ROOT, 'docs', `preview-${lang}.svg`);
  writeFileSync(file, toSvg(render(lang)));
  console.log(`written ${file}`);
}
