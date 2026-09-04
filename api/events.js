const { google } = require('googleapis');

export default async function handler(req, res) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = '1fymh7kY8cme4rYP3Tb7g1YzzxnJI2pc9o9dXHTPCGfU';
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Untitled!A2:N1000',
    });

    const rows = response.data.values || [];
    
    // Helper function to extract Eventbrite ID from URL
    function extractEventbriteId(url) {
      if (!url) return null;
      const match = url.match(/eventbrite\.com\/e\/[^\/]+-(\d+)/);
      return match ? match[1] : null;
    }
    
    const events = rows
      .filter(row => {
        const title = row[2] || '';
        return title !== 'Hong Kong Observation Wheel';
      })
      .map(row => {
        const startDateTime = new Date(row[5]);
        const endDateTime = new Date(row[6]);
        
        const timeOptions = { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Hong_Kong'
        };
        
        const ticketUrl = row[11] || '';
        const eventbriteId = extractEventbriteId(ticketUrl);
        
        return {
          id: row[0],
          title: row[2],
          date: row[5]?.split('T')[0],
          endDate: row[6]?.split('T')[0],
          startTime: startDateTime.toLocaleTimeString('en-US', timeOptions),
          endTime: endDateTime.toLocaleTimeString('en-US', timeOptions),
          description: row[9] || '',
          imageUrl: row[10] || '',
          ticketUrl: ticketUrl,
          eventbriteId: eventbriteId,
          detailsUrl: ticketUrl,
          isFree: row[12] === 'TRUE',
          status: row[3],
        };
      })
      .filter(event => event.status === 'live');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300');
    
    res.status(200).json(events);
    
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}