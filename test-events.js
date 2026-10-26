require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function main() {
  try {
    let rawKey = process.env.GOOGLE_SERVICE_KEY;

    rawKey = rawKey.replace(
      /"private_key":\s*"([\s\S]*?)"/,
      (match, keyContent) => `"private_key": "${keyContent.replace(/\r?\n/g, '\\n')}"`
    );

    const credentials = JSON.parse(rawKey);
    console.log('✅ Credentials parsed. client_email:', credentials.client_email);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = '1fymh7kY8cme4rYP3Tb7g1YzzxnJI2pc9o9dXHTPCGfU';

    console.log('⏳ Requesting data from Google Sheets...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Untitled!A2:N1000',
    });

    const rows = response.data.values || [];
    console.log('✅ Success! Row count:', rows.length);
    console.log('First row:', rows[0]);

  } catch (err) {
    console.log('❌ FAILED');
    console.log('Message:', err.message);
    if (err.response && err.response.data) {
      console.log('API error details:', JSON.stringify(err.response.data, null, 2));
    }
    console.log('--- Full stack ---');
    console.log(err.stack);
  }
}

main();
