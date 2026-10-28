const fs = require('fs');
const path = require('path');

async function uploadReport() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    throw new Error('Slack token or channel ID missing');
  }

  const filePath = path.join(
    __dirname,
    '..',
    'reports',
    'smoke-test-report.pdf'
  );

  if (!fs.existsSync(filePath)) {
    throw new Error('PDF report not found');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const filename = 'smoke-test-report.pdf';

  // Step 1: Request upload URL
  const uploadResponse = await fetch(
    'https://slack.com/api/files.getUploadURLExternal',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        filename,
        length: String(fileBuffer.length)
      })
    }
  );

  const uploadData = await uploadResponse.json();

  if (!uploadData.ok) {
    throw new Error(`Slack upload URL error: ${uploadData.error}`);
  }

  // Step 2: Upload PDF bytes
  const fileResponse = await fetch(uploadData.upload_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf'
    },
    body: fileBuffer
  });

  if (!fileResponse.ok) {
    throw new Error(`PDF upload failed: ${fileResponse.status}`);
  }

  // Step 3: Complete upload and share to channel
  const completeResponse = await fetch(
    'https://slack.com/api/files.completeUploadExternal',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: [
          {
            id: uploadData.file_id,
            title: 'Playwright Smoke Test Report'
          }
        ],
        channel_id: channel,
        initial_comment: '📊 Automated Playwright Smoke Test Report'
      })
    }
  );

  const result = await completeResponse.json();

  if (!result.ok) {
    throw new Error(`Slack sharing failed: ${result.error}`);
  }

  console.log('PDF successfully uploaded to Slack!');
}

uploadReport().catch(error => {
  console.error(error.message);
  process.exit(1);
});