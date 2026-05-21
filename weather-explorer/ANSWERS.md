# ANSWERS.md

---

## 1. How to Run

**Prerequisites:** Node.js v18+ and a free OpenWeatherMap API key.

**Steps:**

```bash
# 1. Install dependencies
npm install

# 2. Set up your API key
cp .env.example .env
# Edit .env — replace "your_api_key_here" with your actual key from openweathermap.org

# 3. Start the server
npm start

# 4. Open http://localhost:3000
```

Full instructions including how to get a free API key are in README.md.

---

## 2. Stack Choice

**Chosen stack:** Node.js + Express backend, vanilla HTML/CSS/JS frontend.

**Why:**
- Node.js is a natural fit for a proxy/aggregator service — it's fast at I/O-heavy work (making multiple outbound API calls), and `Promise.allSettled` makes parallel fetching with partial failures trivial.
- Express adds routing and middleware in ~10 lines. No boilerplate.
- Vanilla frontend means zero build step. `npm start` and it works. No Webpack, no transpiling, no Vite config.
- The entire frontend is one file (`public/index.html`) — easy to read, easy to run, easy to hand to someone.

**Worse choice: Python + Jinja2 server-side rendering**  
It would have worked, but SSR for a weather app forces a full page reload on every search. The compare tab especially benefits from async fetching — SSR would make partial failures (one bad city out of five) much messier to handle and display.

**Also worse: a React SPA without a backend**  
Calling OpenWeatherMap directly from the browser exposes the API key in the client source. A backend proxy keeps the key server-side.

---

## 3. One Real Edge Case

**Edge case: Partial failure in city comparison**

**File:** `src/server.js`, line 108 — the `Promise.allSettled()` call in the `/api/compare` endpoint.

```js
const results = await Promise.allSettled(
  cityList.map(async (city) => { ... })
);
```

**What it handles:** When a user compares 4 cities and one is misspelled (e.g. "Tokyoo"), `Promise.allSettled` lets all 4 requests run in parallel and collects both successes and failures. The three valid cities render normally; the bad one shows an inline error card.

**Without this handling:** Using `Promise.all` instead would cause the entire comparison to throw and fail the moment any single city returns a 404. The user would get a generic error with no results — even the three valid cities — with no indication which city caused the problem.

The frontend (`public/index.html`, `renderCompare()` function) specifically checks `c.success` on each result and renders an error card for failed cities, so the partial-failure state is surfaced clearly.

---

## 4. AI Usage

**Tool used:** Claude (claude.ai)

**What I asked / what it gave me:**

1. **Asked:** "Write an Express proxy endpoint that fetches from OpenWeatherMap with a timeout and translates HTTP status codes into user-friendly messages."  
   **Got:** A working implementation using `AbortController` for timeout. The timeout and abort logic was correct.  
   **What I changed:** The AI's original version threw a generic `Error` for all non-OK status codes. I split it into specific cases — 404 (city not found), 401 (bad API key), 429 (rate limited) — with different messages for each. This matters because a 404 is a user error ("check your spelling") while a 429 is a transient error ("wait and retry") and a 401 is a configuration error. Lumping them together with the same message would be actively unhelpful.

2. **Asked:** "Write a regex to validate city names, including cities with apostrophes (Côte d'Ivoire), hyphens (Clermont-Ferrand), and periods (St. Louis)."  
   **Got:** `/^[\p{L}\s'\-.,()]+$/u` with the Unicode flag — used as-is in `src/server.js` line 19. This correctly allows accented characters via `\p{L}` rather than just `[a-zA-Z]`.

3. **Asked:** Help designing the visual layout for the compare grid and the weather card header.  
   **Got:** General structure. I replaced the suggested colour scheme (purple/white gradient — very generic) with an editorial newspaper-style palette (warm paper background, ink borders, serif display font) to make the interface more distinctive and less AI-default looking.

---

## 5. Honest Gap

**What isn't good enough:** There's no caching. Every keystroke search hits the OpenWeatherMap API fresh. If a user searches "Paris" twice within 30 seconds, it makes two identical API calls.

**What I'd do with another day:**  
Add a simple in-memory cache (a `Map` with TTL) in `src/server.js` — key by lowercased city name, expire after 5 minutes. This would:
- Reduce API calls (OpenWeatherMap free tier is 60 calls/minute, which is easy to hit while demoing the compare feature with 5 cities)
- Make repeat searches feel instant
- Be maybe 15 lines of code

A production version would use Redis instead of in-memory so the cache survives server restarts and works across multiple Node processes.
