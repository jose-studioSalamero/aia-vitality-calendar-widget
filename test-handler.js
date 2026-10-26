require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function handler() {
  try {
    let rawKey = process.env.GOOGLE_SERVICE_KEY;

    rawKey = rawKey.replace(
      /"private_key":\s*"([\s\S]*?)"/,
      (match, keyContent) => `"private_key": "${keyContent.replace(/\r?\n/g, '\\n')}"`
    );

    const credentials = JSON.parse(rawKey);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1fymh7kY8cme4rYP3Tb7g1YzzxnJI2pc9o9dXHTPCGfU';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Untitled!A2:N1000',
    });

    const rows = response.data.values || [];

    function extractEventbriteId(url) {
      if (!url) return null;
      const match = url.match(/eventbrite\.(com|hk)\/e\/[^\/]+-(\d+)/);
      return match ? match[2] : null;
    }

    const events = rows
      .filter(row => (row[2] || '') !== 'Hong Kong Observation Wheel')
      .map(row => {
        const startDateTime = new Date(row[5]);
        const endDateTime = new Date(row[6]);
        const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Hong_Kong' };
        const ticketUrl = row[11] || '';
        const eventbriteId = extractEventbriteId(ticketUrl);

        return {
          id: row[0],
          event_id: row[0],
          title: row[2],
          date: row[5]?.split('T')[0],
          endDate: row[6]?.split('T')[0],
          startTime: startDateTime.toLocaleTimeString('en-US', timeOptions),
          endTime: endDateTime.toLocaleTimeString('en-US', timeOptions),
          description: row[9] || '',
          imageUrl: row[10] || '',
          ticketUrl,
          eventbriteId,
          detailsUrl: ticketUrl,
          isFree: row[12] === 'TRUE',
          status: row[3],
        };
      })
      .filter(event => event.status === 'live');

    console.log('✅ SUCCESS. Final event count:', events.length);
    console.log('Sample event:', events[0]);

  } catch (error) {
    console.log('❌ HANDLER FAILED');
    console.log('Message:', error.message);
    console.log(error.stack);
  }
}

handler();
