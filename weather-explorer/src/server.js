require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Timeout wrapper — handles slow API (edge case #1)
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out after ' + timeoutMs + 'ms');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Validate city name — handles bad user input (edge case #2)
function validateCity(city) {
  if (!city || typeof city !== 'string') return false;
  const trimmed = city.trim();
  // Allow letters, spaces, hyphens, apostrophes, periods (e.g. "St. Louis", "Côte d'Ivoire")
  if (trimmed.length < 1 || trimmed.length > 100) return false;
  if (!/^[\p{L}\s'\-.,()]+$/u.test(trimmed)) return false;
  return trimmed;
}

// GET /api/weather?city=Paris
app.get('/api/weather', async (req, res) => {
  // Input validation
  const city = validateCity(req.query.city);
  if (!city) {
    return res.status(400).json({ error: 'Invalid city name. Use letters, spaces, or hyphens only.' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: OPENWEATHER_API_KEY not set.' });
  }

  try {
    // Fetch weather
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
    const weatherRes = await fetchWithTimeout(weatherUrl);

    // Handle API errors (edge case #3)
    if (!weatherRes.ok) {
      if (weatherRes.status === 404) {
        return res.status(404).json({ error: `City "${city}" not found. Check the spelling and try again.` });
      }
      if (weatherRes.status === 401) {
        return res.status(500).json({ error: 'Invalid API key. Check your OPENWEATHER_API_KEY.' });
      }
      if (weatherRes.status === 429) {
        return res.status(429).json({ error: 'API rate limit reached. Please wait a moment and try again.' });
      }
      return res.status(502).json({ error: `Weather API returned status ${weatherRes.status}.` });
    }

    const weather = await weatherRes.json();

    // Fetch country info from REST Countries (free, no key needed)
    const countryCode = weather.sys?.country;
    let countryInfo = null;

    if (countryCode) {
      try {
        const countryRes = await fetchWithTimeout(
          `https://restcountries.com/v3.1/alpha/${countryCode}`,
          5000
        );
        if (countryRes.ok) {
          const countryData = await countryRes.json();
          const c = countryData[0];
          countryInfo = {
            name: c.name?.common,
            capital: c.capital?.[0],
            population: c.population,
            region: c.region,
            subregion: c.subregion,
            flag: c.flags?.svg || c.flags?.png,
            currency: Object.values(c.currencies || {})[0],
            languages: Object.values(c.languages || {}).slice(0, 3),
            timezones: c.timezones?.slice(0, 2),
          };
        }
      } catch {
        // Country API failing is non-fatal — degrade gracefully
        countryInfo = null;
      }
    }

    // Build unified response
    res.json({
      city: weather.name,
      country: countryCode,
      coords: weather.coord,
      weather: {
        main: weather.weather[0]?.main,
        description: weather.weather[0]?.description,
        icon: weather.weather[0]?.icon,
        temp: weather.main?.temp,
        feels_like: weather.main?.feels_like,
        temp_min: weather.main?.temp_min,
        temp_max: weather.main?.temp_max,
        humidity: weather.main?.humidity,
        pressure: weather.main?.pressure,
        visibility: weather.visibility,
        wind_speed: weather.wind?.speed,
        wind_deg: weather.wind?.deg,
        clouds: weather.clouds?.all,
        sunrise: weather.sys?.sunrise,
        sunset: weather.sys?.sunset,
        timezone: weather.timezone,
      },
      country_info: countryInfo,
    });

  } catch (err) {
    if (err.message.includes('timed out')) {
      return res.status(504).json({ error: 'The weather service is taking too long to respond. Try again in a moment.' });
    }
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
});

// GET /api/compare?cities=Paris,Tokyo,Lagos
app.get('/api/compare', async (req, res) => {
  const rawCities = req.query.cities;
  if (!rawCities) {
    return res.status(400).json({ error: 'Provide cities as ?cities=Paris,Tokyo,Lagos' });
  }

  const cityList = rawCities.split(',').map(c => validateCity(c)).filter(Boolean);

  if (cityList.length < 2) {
    return res.status(400).json({ error: 'Provide at least 2 valid city names separated by commas.' });
  }
  if (cityList.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 cities can be compared at once.' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: OPENWEATHER_API_KEY not set.' });
  }

  // Fetch all in parallel
  const results = await Promise.allSettled(
    cityList.map(async (city) => {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
      const r = await fetchWithTimeout(url);
      if (!r.ok) {
        if (r.status === 404) throw new Error(`City "${city}" not found`);
        throw new Error(`API error ${r.status} for "${city}"`);
      }
      const w = await r.json();
      return {
        city: w.name,
        country: w.sys?.country,
        temp: w.main?.temp,
        feels_like: w.main?.feels_like,
        humidity: w.main?.humidity,
        description: w.weather[0]?.description,
        icon: w.weather[0]?.icon,
        wind_speed: w.wind?.speed,
      };
    })
  );

  const data = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { success: true, ...r.value }
      : { success: false, city: cityList[i], error: r.reason?.message || 'Unknown error' }
  );

  res.json({ cities: data });
});

app.listen(PORT, () => {
  console.log(`\n🌍 Weather Explorer running at http://localhost:${PORT}\n`);
});
