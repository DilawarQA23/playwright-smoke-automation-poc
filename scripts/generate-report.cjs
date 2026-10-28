const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..');

const resultsPath = path.join(root, 'test-results/results.json');
const outputDir = path.join(root, 'reports');

if (!fs.existsSync(resultsPath)) {
  console.error('Playwright JSON report not found!');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

const testCases = [];

function collectTests(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const lastResult = results[results.length - 1] || {};

        const status =
          test.status === 'expected'
            ? 'PASSED'
            : test.status === 'skipped'
              ? 'SKIPPED'
              : test.status === 'flaky'
                ? 'FLAKY'
                : 'FAILED';

        testCases.push({
          title: spec.title,
          status,
          duration: results.reduce(
            (sum, result) => sum + (result.duration || 0),
            0
          ),
          error: lastResult.error?.message || ''
        });
      }
    }

    collectTests(suite.suites);
  }
}

collectTests(data.suites);

const passed = testCases.filter(t => t.status === 'PASSED').length;
const failed = testCases.filter(t => t.status === 'FAILED').length;
const skipped = testCases.filter(t => t.status === 'SKIPPED').length;
const flaky = testCases.filter(t => t.status === 'FLAKY').length;
const total = testCases.length;

const passRate = total
  ? ((passed / total) * 100).toFixed(1)
  : '0.0';

const escapeHtml = value =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

const executionDate = data.stats?.startTime
  ? new Date(data.stats.startTime).toLocaleString('en-GB', {
      timeZone: 'UTC'
    }) + ' UTC'
  : new Date().toISOString();

const duration = ((data.stats?.duration || 0) / 1000).toFixed(1);

const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<style>
  @page {
    size: A4;
    margin: 16mm;
  }

  body {
    font-family: Arial, sans-serif;
    color: #1f2937;
    font-size: 11px;
  }

  h1 {
    color: #1d4ed8;
    font-size: 24px;
  }

  h2 {
    font-size: 16px;
    margin-top: 25px;
  }

  .subtitle {
    color: #6b7280;
    font-size: 13px;
  }

  .info {
    margin-top: 20px;
    padding: 15px;
    background: #f3f4f6;
    border-radius: 8px;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 25px;
  }

  .card {
    background: #f3f4f6;
    padding: 15px;
    border-radius: 8px;
  }

  .label {
    color: #6b7280;
    font-size: 10px;
  }

  .value {
    font-size: 23px;
    font-weight: bold;
    margin-top: 8px;
  }

  .green { color: #15803d; }
  .red { color: #dc2626; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
  }

  th {
    background: #dbeafe;
    color: #1e3a8a;
    text-align: left;
    padding: 10px;
  }

  td {
    padding: 9px;
    border-bottom: 1px solid #e5e7eb;
  }

  tr {
    page-break-inside: avoid;
  }

  .passed { color: #15803d; font-weight: bold; }
  .failed { color: #dc2626; font-weight: bold; }
  .skipped { color: #6b7280; }
  .flaky { color: #d97706; font-weight: bold; }

  .failure {
    margin-bottom: 15px;
    padding: 10px;
    background: #fef2f2;
    border-radius: 6px;
    overflow-wrap: anywhere;
  }
</style>
</head>

<body>

<h1>Playwright Smoke Test Report</h1>
<div class="subtitle">QA Automation — CI/CD Execution Report</div>

<div class="info">
  <p><b>Project:</b> Playwright Automation POC</p>
  <p><b>Environment:</b> Demo</p>
  <p><b>Execution Date:</b> ${escapeHtml(executionDate)}</p>
  <p><b>Browser:</b> Chromium</p>
  <p><b>Execution Duration:</b> ${duration}s</p>
</div>

<div class="cards">
  <div class="card">
    <div class="label">PASSED</div>
    <div class="value green">${passed}</div>
  </div>

  <div class="card">
    <div class="label">FAILED</div>
    <div class="value red">${failed}</div>
  </div>

  <div class="card">
    <div class="label">TOTAL TESTS</div>
    <div class="value">${total}</div>
  </div>

  <div class="card">
    <div class="label">PASS RATE</div>
    <div class="value">${passRate}%</div>
  </div>
</div>

<h2>Test Execution Results</h2>

<p>Skipped: ${skipped} | Flaky: ${flaky}</p>

<table>
<thead>
<tr>
  <th>#</th>
  <th>Test Case</th>
  <th>Status</th>
  <th>Duration</th>
</tr>
</thead>

<tbody>
${testCases.map((test, index) => `
<tr>
  <td>${index + 1}</td>
  <td>${escapeHtml(test.title)}</td>
  <td class="${test.status.toLowerCase()}">${test.status}</td>
  <td>${(test.duration / 1000).toFixed(1)}s</td>
</tr>
`).join('')}
</tbody>
</table>

${failed > 0 ? `
<h2>Failure Details</h2>
${testCases
  .filter(test => test.status === 'FAILED')
  .map(test => `
    <div class="failure">
      <b>${escapeHtml(test.title)}</b>
      <p>${escapeHtml(test.error)}</p>
    </div>
  `).join('')}
` : ''}

</body>
</html>
`;

async function generatePDF() {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'load' });

    const outputPath = path.join(
      outputDir,
      'smoke-test-report.pdf'
    );

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true
    });

    console.log(`PDF generated: ${outputPath}`);
    console.log(`${passed} passed, ${failed} failed, ${total} total`);
  } finally {
    await browser.close();
  }
}

generatePDF().catch(error => {
  console.error('PDF generation failed:', error);
  process.exit(1);
});