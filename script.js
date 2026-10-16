// Configuration
const API_ENDPOINT = "/api/events";
const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";
const TIME_CHECK_INTERVAL_MS = 30 * 1000;        // re-check the clock every 30s
const EVENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // refetch events from API every 5 min

function getHongKongDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type).value;

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
  };
}

// NEW: get current hour/minute in Hong Kong time, 24h format
function getHongKongTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONG_KONG_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type).value;
  let hour = Number(getPart("hour"));
  if (hour === 24) hour = 0; // some locales format midnight as 24

  return {
    hour,
    minute: Number(getPart("minute")),
  };
}

function getTodayDateStr(date = new Date()) {
  const { year, month, day } = getHongKongDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getHongKongTodayDate(date = new Date()) {
  const { year, month, day } = getHongKongDateParts(date);
  return new Date(year, month - 1, day);
}

function isPastDate(dateStr, todayStr = getTodayDateStr()) {
  return dateStr < todayStr;
}

// NEW: parse a time string like "6:00 PM", "18:00", "6:00pm" into minutes since midnight
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;

  const str = timeStr.trim().toUpperCase();

  // Match "H:MM AM/PM" or "HH:MM AM/PM"
  let match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3];
    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  // Match 24-hour "HH:MM"
  match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour * 60 + minute;
  }

  return null; // unknown format, caller should treat as "not expired"
}

// NEW: is this specific event sold out?
// ADJUST field names below to match whatever your API actually returns.
function isEventSoldOut(event) {
  if (!event) return false;
  if (event.soldOut === true) return true;
  if (event.isSoldOut === true) return true;
  if (event.sold_out === true) return true;
  if (typeof event.ticketsAvailable === "number" && event.ticketsAvailable <= 0) return true;
  if (typeof event.status === "string" && event.status.toLowerCase() === "sold out") return true;
  return false;
}

// NEW: has this event's time window already elapsed (HK time)?
function isEventExpired(event, now = new Date()) {
  if (!event) return true;

  const todayStr = getTodayDateStr(now);
  const endDateStr = event.endDate || event.date;

  // Entire event (including any date range) is before today -> expired
  if (endDateStr < todayStr) return true;

  // Event ends on a future date -> not expired yet
  if (endDateStr > todayStr) return false;

  // Event ends today -> check the clock
  if (!event.endTime) return false; // no end time info, assume still valid for today

  const nowParts = getHongKongTimeParts(now);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const endMinutes = parseTimeToMinutes(event.endTime);

  if (endMinutes === null) return false; // couldn't parse, don't hide it
  return nowMinutes >= endMinutes;
}

// NEW: combined visibility check used everywhere an event is displayed
function isEventVisible(event, now = new Date()) {
  return !isEventExpired(event, now) && !isEventSoldOut(event);
}

// State
let currentDate = getHongKongTodayDate();
let events = [];
let selectedDate = null;
let currentView = 'list';
let selectedEvent = null;

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Initialize
async function init() {
  renderCalendar();
  setupEventListeners();
  setupMessageListener();
  selectDate(getTodayDateStr());
  await fetchEvents();
  renderCalendar();
  if (selectedDate) {
    selectDate(selectedDate);
  }

  startTimeChecker();   // NEW: keep checking the clock
  startAutoRefresh();   // NEW: periodically refetch events (sold-out status, etc.)
}

// Fetch events from Google Sheets (via API)
async function fetchEvents() {
  try {
    console.log('Fetching events from:', API_ENDPOINT);
    const response = await fetch(API_ENDPOINT);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    events = await response.json();
    console.log('Loaded events:', events.length);
    console.log('Events:', events);
    
  } catch (error) {
    console.error("Error fetching events:", error);
    events = [];
  }
}

// Render calendar
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  document.getElementById("current-month").textContent =
    currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventDates = getEventDatesForMonth(year, month);

  const daysContainer = document.getElementById("calendar-days");
  daysContainer.innerHTML = "";

  for (let i = 0; i < firstDay; i++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day empty";
    daysContainer.appendChild(emptyDay);
  }

  const todayStr = getTodayDateStr();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day";
    dayEl.textContent = day;
    dayEl.dataset.date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const dateStr = dayEl.dataset.date;
    const isPast = isPastDate(dateStr, todayStr);

    if (!isPast) {
      if (eventDates.start.has(dateStr)) {
        dayEl.classList.add("has-event");
      } else if (eventDates.range.has(dateStr)) {
        dayEl.classList.add("has-event-range");
      }
    }

    if (dateStr === todayStr) {
      dayEl.classList.add("today");
    }

    if (isPast) {
      dayEl.classList.add("past");
      dayEl.setAttribute("aria-disabled", "true");
    } else {
      if (selectedDate === dateStr) {
        dayEl.classList.add("selected");
      }

      dayEl.addEventListener("click", () => selectDate(dateStr));
    }

    daysContainer.appendChild(dayEl);
  }
}

function getEventDatesForMonth(year, month) {
  const startDates = new Set();
  const rangeDates = new Set();

  events
    .filter((event) => isEventVisible(event)) // NEW: skip expired/sold-out events entirely
    .forEach((event) => {
      const eventStart = parseLocalDate(event.date);
      const eventEnd = event.endDate ? parseLocalDate(event.endDate) : eventStart;

      if (
        (eventStart.getFullYear() === year && eventStart.getMonth() === month) ||
        (eventEnd.getFullYear() === year && eventEnd.getMonth() === month) ||
        (eventStart < new Date(year, month, 1) &&
          eventEnd > new Date(year, month + 1, 0))
      ) {
        if (
          eventStart.getFullYear() === year &&
          eventStart.getMonth() === month
        ) {
          startDates.add(event.date);
        }

        let currentDate = new Date(
          Math.max(eventStart, new Date(year, month, 1)),
        );
        const endDate = new Date(
          Math.min(eventEnd, new Date(year, month + 1, 0)),
        );

        while (currentDate <= endDate) {
          const dateStr = toDateKey(currentDate);
          if (dateStr !== event.date) {
            rangeDates.add(dateStr);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    });

  return { start: startDates, range: rangeDates };
}

function selectDate(dateStr) {
  if (isPastDate(dateStr)) {
    return;
  }

  selectedDate = dateStr;
  currentView = 'list';
  const date = parseLocalDate(dateStr);

  document.querySelectorAll('.calendar-day.selected').forEach(el => {
    el.classList.remove('selected');
  });

  const clickedDay = document.querySelector(`[data-date="${dateStr}"]`);
  if (clickedDay) {
    clickedDay.classList.add('selected');
  }

  document.getElementById("selected-date").textContent =
    date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

  console.log('Selected date:', dateStr);

  const dayEvents = events.filter((event) => {
    const isMatch = event.date === dateStr || 
                    (event.endDate && dateStr >= event.date && dateStr <= event.endDate);
    return isMatch && isEventVisible(event); // NEW: hide expired/sold-out events
  });

  console.log('Day events found:', dayEvents);

  renderEvents(dayEvents);
}

function renderEvents(dayEvents) {
  const eventsContainer = document.getElementById("events-list");

  if (dayEvents.length === 0) {
    eventsContainer.innerHTML =
      '<p class="no-events">No events on this date</p>';
    return;
  }

  eventsContainer.innerHTML = dayEvents
    .map(
      (event) => `
        <div class="event-card" data-event-id="${event.id}">
            ${event.imageUrl ? `<img src="${event.imageUrl}" alt="${event.title}" class="event-image">` : ""}
            <h3>${event.title}</h3>
            <p class="event-time">${event.startTime} - ${event.endTime}</p>
            <p class="event-description">${event.description}</p>
            <div class="event-buttons">
                ${event.eventbriteId ? 
                  `<button class="event-btn event-btn-primary" data-eventbrite-id="${event.eventbriteId}">Get Tickets</button>` 
                  : event.ticketUrl ? 
                  `<a href="${event.ticketUrl}" class="event-btn event-btn-primary" target="_blank">Get Tickets</a>` 
                  : ""}
                <button class="event-btn event-btn-secondary" data-event-detail="${event.id}">Learn More</button>
            </div>
        </div>
    `,
    )
    .join("");

  document.querySelectorAll('[data-eventbrite-id]').forEach(button => {
    button.addEventListener('click', function() {
      const eventbriteId = this.getAttribute('data-eventbrite-id');
      openEventbriteCheckout(eventbriteId);
    });
  });

  document.querySelectorAll('[data-event-detail]').forEach(button => {
    button.addEventListener('click', function() {
      const eventId = this.getAttribute('data-event-detail');
      const event = events.find(e => e.id === eventId);
      if (event) {
        showEventDetail(event);
      }
    });
  });
}

// UPDATED: Single showEventDetail function with height notification
function showEventDetail(event) {
  currentView = 'detail';
  selectedEvent = event;
  
  const eventsContainer = document.getElementById("events-list");
  const eventDate = parseLocalDate(event.date);
  
  eventsContainer.innerHTML = `
    <div class="event-detail">
      <button class="back-button" id="back-to-list">
        <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
          <path fill-rule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
        </svg>
        Back to Events
      </button>
      
      ${event.imageUrl ? `<img src="${event.imageUrl}" alt="${event.title}" class="event-detail-image">` : ""}
      
      <h2 class="event-detail-title">${event.title}</h2>
      
      <div class="event-detail-info">
        <div class="info-item">
          <strong>📅 Date:</strong>
          <span>${eventDate.toLocaleDateString("en-US", { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</span>
        </div>
        
        <div class="info-item">
          <strong>🕐 Time:</strong>
          <span>${event.startTime} - ${event.endTime}</span>
        </div>
        
        ${event.isFree ? '<div class="info-item"><span class="free-badge-large">FREE EVENT</span></div>' : ''}
      </div>
      
      <div class="event-detail-description">
        <h3>About This Event</h3>
        <p>${event.description}</p>
      </div>
      
      <div class="event-detail-actions">
        ${event.eventbriteId ? 
          `<button class="event-btn event-btn-primary event-btn-large" data-eventbrite-id="${event.eventbriteId}">Get Tickets</button>` 
          : event.ticketUrl ? 
          `<a href="${event.ticketUrl}" class="event-btn event-btn-primary event-btn-large" target="_blank">Get Tickets</a>` 
          : ""}
        ${event.ticketUrl ? `<a href="${event.ticketUrl}" class="event-btn event-btn-secondary" target="_blank">View on Eventbrite</a>` : ''}
      </div>
    </div>
  `;

  document.getElementById('back-to-list').addEventListener('click', () => {
    selectDate(selectedDate);
  });

  const ticketBtn = eventsContainer.querySelector('[data-eventbrite-id]');
  if (ticketBtn) {
    ticketBtn.addEventListener('click', function() {
      const eventbriteId = this.getAttribute('data-eventbrite-id');
      openEventbriteCheckout(eventbriteId);
    });
  }

  // NEW: Notify parent of height change
  setTimeout(() => {
    notifyParentOfHeight();
  }, 100);
}

function openEventbriteCheckout(eventbriteId) {
  console.log('Sending message to parent window for Eventbrite ID:', eventbriteId);
  
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'OPEN_EVENTBRITE_MODAL',
      eventbriteId: eventbriteId
    }, '*');
  } else {
    window.open(`https://www.eventbrite.com/e/${eventbriteId}`, '_blank');
  }
}

// Setup message listener for opening events from parent
function setupMessageListener() {
  window.addEventListener('message', function(event) {
    console.log('Received message:', event.data);
    
    if (event.data.type === 'OPEN_EVENT' && event.data.eventId) {
      openEventById(event.data.eventId);
    }
  });
}

// Open event by ID
function openEventById(eventId) {
  console.log('Opening event by ID:', eventId);
  
  const event = events.find(e => e.id === eventId || e.eventbriteId === eventId);
  
  if (!event) {
    console.warn('Event not found:', eventId);
    return;
  }

  if (!isEventVisible(event)) {
    console.warn('Event is expired or sold out, ignoring open request:', eventId);
    return;
  }
  
  console.log('Found event:', event);
  
  selectDate(event.date);
  
  setTimeout(() => {
    showEventDetail(event);
    
    const eventDetail = document.querySelector('.event-detail');
    if (eventDetail) {
      eventDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

// NEW: Notify parent of height changes
function notifyParentOfHeight() {
  if (window.parent && window.parent !== window) {
    const height = document.body.scrollHeight;
    window.parent.postMessage({
      type: 'RESIZE',
      height: height
    }, '*');
  }
}

// NEW: re-render whatever is currently selected, respecting visibility rules
function refreshSelectedDateEvents() {
  if (!selectedDate) return;

  // If we're looking at a detail view for an event that just expired/sold out, bounce back to list
  if (currentView === 'detail' && selectedEvent && !isEventVisible(selectedEvent)) {
    selectDate(selectedDate);
    return;
  }

  if (currentView === 'list') {
    const dayEvents = events.filter((event) => {
      const isMatch = event.date === selectedDate ||
                      (event.endDate && selectedDate >= event.date && selectedDate <= event.endDate);
      return isMatch && isEventVisible(event);
    });
    renderEvents(dayEvents);
  }
}

// NEW: periodically re-check the clock so expired events/days update live without a reload
function startTimeChecker() {
  setInterval(() => {
    renderCalendar();
    refreshSelectedDateEvents();
  }, TIME_CHECK_INTERVAL_MS);
}

// NEW: periodically refetch events from the API so sold-out status stays current
function startAutoRefresh() {
  setInterval(async () => {
    await fetchEvents();
    renderCalendar();
    refreshSelectedDateEvents();
  }, EVENT_REFRESH_INTERVAL_MS);
}

function setupEventListeners() {
  document.getElementById("prev-month").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });
}

document.querySelectorAll('.calendar-day').forEach(day => {
  day.addEventListener('click', (e) => {
    e.preventDefault();
    const eventId = day.getAttribute('data-event');
    if (eventId) {
      showEventDetail(eventId);
      window.parent.postMessage({ 
        type: 'navigate', 
        eventId: eventId 
      }, '*');
    }
  });
});

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const eventId = link.getAttribute('data-event');
    if (eventId) {
      showEventDetail(eventId);
    }
  });
});

init();