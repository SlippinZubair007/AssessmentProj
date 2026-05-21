# Weather Explorer

Compare weather and country data across any cities in the world.  
Built on [OpenWeatherMap](https://openweathermap.org/api) + [REST Countries](https://restcountries.com/) — two free, public APIs.

**What you can do that the raw API websites can't:**
- Compare weather across 2–5 cities side by side, sortable by temperature / humidity / wind
- See weather and country context (population, currency, languages, timezones) together on one screen
- Get a live local-time display and a sunrise/sunset progress bar for any city

---

## How to Run

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or newer (`node -v` to check)
- A free OpenWeatherMap API key (takes ~2 minutes — see below)

### 1. Get a Free API Key

1. Go to [https://openweathermap.org/api](https://openweathermap.org/api)
2. Click **"Sign Up"** (free tier is enough)
3. After signing in, go to **API keys** tab
4. Copy your key (it may take a few minutes to activate on a new account)

### 2. Install & Run

```bash
# Clone or download this repo, then:
cd weather-explorer

npm install

cp .env.example .env
# Open .env and replace "your_api_key_here" with your actual key

npm start
```

Then open **http://localhost:3000** in your browser.

> **One-liner after setup:**  
> `npm start`

---

## Project Structure

```
weather-explorer/
├── src/
│   └── server.js       # Express server + API proxy with error/timeout handling
├── public/
│   └── index.html      # Single-file frontend (HTML + CSS + JS)
├── .env.example        # Copy to .env and add your API key
├── .gitignore
├── package.json
└── README.md
```

---

## Error Handling

The app handles three specific failure modes the spec requires:

| Failure | How it's handled |
|---|---|
| API is slow | 8-second timeout on all weather calls, 5-second on country calls. Graceful "timed out" message returned. |
| API returns error | HTTP status codes (404, 401, 429, 5xx) are caught and translated into plain-English messages. |
| Bad user input | City names are validated with a regex before any fetch is made. Empty, too-long, or symbol-heavy strings are rejected immediately with a clear message. |

---

## Tech Notes

- **No frontend build step** — the entire UI is a single `index.html` with vanilla JS
- **REST Countries is used as a secondary, non-fatal API** — if it fails, weather data still shows
- **Compare endpoint uses `Promise.allSettled`** — one bad city name won't fail the whole comparison
