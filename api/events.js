const { google } = require('googleapis');

export default async function handler(req, res) {
  try {
    // Get credentials from environment variable
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    
    // Authenticate with service account
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = '1fymh7kY8cme4rYP3Tb7g1YzzxnJI2pc9o9dXHTPCGfU';
    
    // Fetch all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Untitled!A2:N1000', // Start from row 2 to skip headers, adjust range as needed
    });

    const rows = response.data.values || [];
    
    // Transform rows into event objects
    const events = rows
      .filter(row => {
        // Filter out Hong Kong Observation Wheel
        const title = row[2] || '';
        return title !== 'Hong Kong Observation Wheel';
      })
      .map(row => {
        const startDateTime = new Date(row[5]);
        const endDateTime = new Date(row[6]);
        
        return {
          id: row[0], // event_id
          title: row[2], // title
          date: startDateTime.toISOString().split('T')[0],
          endDate: endDateTime.toISOString().split('T')[0],
          startTime: startDateTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          endTime: endDateTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          description: row[9] || '', // summary
          imageUrl: row[10] || '', // image_url
          ticketUrl: row[11] || '', // eventbrite_url
          detailsUrl: row[11] || '', // eventbrite_url (same as ticket)
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

