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
      // Match patterns for both .com and .hk domains: eventbrite.com/e/event-name-123456789 or eventbrite.hk/e/event-name-123456789
      const match = url.match(/eventbrite\.(com|hk)\/e\/[^\/]+-(\d+)/);
      return match ? match[2] : null; // match[2] because match[1] is the domain (.com or .hk)
    }
    
    const events = rows
      .filter(row => {
        const title = row[2] || '';
        // Exclude Hong Kong Observation Wheel if needed
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
        
        // Debug logging
        console.log('Processing event:', {
          title: row[2],
          ticketUrl: ticketUrl,
          extractedId: eventbriteId
        });
        
        return {
          id: row[0], // event_id
          title: row[2], // title
          date: row[5]?.split('T')[0],
          endDate: row[6]?.split('T')[0],
          startTime: startDateTime.toLocaleTimeString('en-US', timeOptions),
          endTime: endDateTime.toLocaleTimeString('en-US', timeOptions),
          description: row[9] || '', // summary
          imageUrl: row[10] || '', // image_url
          ticketUrl: ticketUrl,
          eventbriteId: eventbriteId,
          detailsUrl: ticketUrl,
          isFree: row[12] === 'TRUE',
          status: row[3], // status
        };
      })
      .filter(event => event.status === 'live'); // Only show live events

    // Enable CORS if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300'); // Cache for 5 minutes
    
    res.status(200).json(events);
    
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}