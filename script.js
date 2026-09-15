// Configuration
const API_ENDPOINT = "/api/events";
const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";

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

  events.forEach((event) => {
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
    return isMatch;
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

init();