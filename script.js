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

function getHongKongTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONG_KONG_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type).value;
  let hour = Number(getPart("hour"));
  if (hour === 24) hour = 0;

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

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;

  const str = timeStr.trim().toUpperCase();

  let match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3];
    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour * 60 + minute;
  }

  return null;
}

function isEventSoldOut(event) {
  if (!event) return false;
  if (event.soldOut === true) return true;
  if (event.isSoldOut === true) return true;
  if (event.sold_out === true) return true;
  if (typeof event.ticketsAvailable === "number" && event.ticketsAvailable <= 0) return true;
  if (typeof event.status === "string" && event.status.toLowerCase() === "sold out") return true;
  return false;
}

function isEventExpired(event, now = new Date()) {
  if (!event) return true;

  const todayStr = getTodayDateStr(now);
  const endDateStr = event.endDate || event.date;

  if (endDateStr < todayStr) return true;
  if (endDateStr > todayStr) return false;

  if (!event.endTime) return false;

  const nowParts = getHongKongTimeParts(now);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const endMinutes = parseTimeToMinutes(event.endTime);

  if (endMinutes === null) return false;
  return nowMinutes >= endMinutes;
}

function isEventVisible(event, now = new Date()) {
  return !isEventExpired(event, now) && !isEventSoldOut(event);
}

// Resolve the best URL to send users to for "Learn More"
function getEventbriteUrl(event) {
  if (!event) return null;
  if (event.ticketUrl) return event.ticketUrl;
  if (event.eventbriteId) return `https://www.eventbrite.com/e/${event.eventbriteId}`;
  return null;
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

function getEventsForDate(dateString) {
  return events.filter(event => event.date === dateString);
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

  startTimeChecker();
  startAutoRefresh();
}

async function fetchEvents() {
  try {
    console.log('Fetching events from:', API_ENDPOINT);
    const response = await fetch(API_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    events = await response.json();
    console.log('Loaded events:', events.length);
  } catch (error) {
    console.error("Error fetching events:", error);
    events = [];
    const eventsContainer = document.getElementById("events-list");
    if (eventsContainer && currentView === 'list') {
      eventsContainer.innerHTML =
        '<p class="no-events">Unable to load events right now. Please refresh.</p>';
    }
  }
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  document.getElementById("current-month").textContent =
    currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

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
    return isMatch && isEventVisible(event);
  });

  console.log('Day events found:', dayEvents);

  renderEvents(dayEvents);
}

function renderEvents(events) {
  const eventsList = document.getElementById('events-list');

  if (!events.length) {
    eventsList.innerHTML = `<div class="no-events">No events scheduled for this date</div>`;
    return;
  }

  eventsList.innerHTML = events.map(event => `
    <div class="event-card" data-event-id="${event.id}">
      <img src="${event.image}" alt="${event.title}" class="event-image" />
      <h3>${event.title}</h3>
      <div class="event-time">
        ${formatEventDate(event.date)} ${event.startTime} - ${event.endTime}
        ${event.isFree ? `<span class="free-badge">Free</span>` : ''}
      </div>
      <div class="event-buttons">
        <button
          class="event-btn event-btn-primary"
          data-url="${event.eventbriteUrl}"
        >
          Get Tickets
        </button>
        <button
          class="event-btn event-btn-secondary"
          data-url="${event.eventbriteUrl}"
        >
          Learn More
        </button>
      </div>
    </div>
  `).join('');

  // Wire up click handlers after injecting HTML
  document.querySelectorAll('.event-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.currentTarget.dataset.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

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
        ${event.eventbriteId
          ? `<button class="event-btn event-btn-primary" data-eventbrite-id="${event.eventbriteId}" data-ticket-url="${event.ticketUrl || ''}">Get Tickets</button>`
          : event.ticketUrl
          ? `<a href="${event.ticketUrl}" class="event-btn event-btn-primary" target="_blank" rel="noopener noreferrer">Get Tickets</a>`
          : ""}
        ${event.ticketUrl ? `<a href="${event.ticketUrl}" class="event-btn event-btn-secondary" target="_blank" rel="noopener noreferrer">View on Eventbrite</a>` : ''}
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
      const ticketUrl = this.getAttribute('data-ticket-url');
      openEventbriteCheckout(eventbriteId, ticketUrl);
    });
  }

  setTimeout(() => {
    notifyParentOfHeight();
  }, 100);
}

function openEventbriteCheckout(eventbriteId, ticketUrl) {
  console.log('Opening checkout for:', eventbriteId);

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'OPEN_EVENTBRITE_MODAL',
      eventbriteId: eventbriteId
    }, '*');
  } else if (ticketUrl) {
    window.open(ticketUrl, '_blank');
  } else {
    window.open(`https://www.eventbrite.com/e/${eventbriteId}`, '_blank');
  }
}

function setupMessageListener() {
  window.addEventListener('message', function(event) {
    console.log('Received message:', event.data);

    if (event.data.type === 'OPEN_EVENT' && event.data.eventId) {
      openEventById(event.data.eventId);
    }
  });
}

function openEventById(eventId) {
  const event = events.find(e => e.id === eventId || e.eventbriteId === eventId);
  if (!event) return console.warn('Event not found:', eventId);
  if (!isEventVisible(event)) return console.warn('Event expired/sold out:', eventId);

  currentDate = parseLocalDate(event.date);
  renderCalendar();

  selectDate(event.date);

  setTimeout(() => {
    showEventDetail(event);
    document.querySelector('.event-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function notifyParentOfHeight() {
  if (window.parent && window.parent !== window) {
    const send = () => {
      window.parent.postMessage({
        type: 'RESIZE',
        height: document.body.scrollHeight
      }, '*');
    };
    send();
    setTimeout(send, 150); // catch late image loads
  }
}

function refreshSelectedDateEvents() {
  if (!selectedDate) return;

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

function startTimeChecker() {
  setInterval(() => {
    renderCalendar();
    refreshSelectedDateEvents();
  }, TIME_CHECK_INTERVAL_MS);
}

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

init();