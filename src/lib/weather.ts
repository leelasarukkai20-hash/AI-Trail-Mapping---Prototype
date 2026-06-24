export interface WeatherSnapshot {
  temp_f: number;
  feels_like_f: number;
  emoji: string;
  label: string;
  wind_mph: number;
  wind_cardinal: string;
}

interface CacheEntry {
  data: WeatherSnapshot;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function degToCardinal(deg: number): string {
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return CARDINALS[i];
}

function codeToConditions(code: number, isDay: boolean): { emoji: string; label: string } {
  if (code === 0) return { emoji: isDay ? "☀️" : "🌙", label: "clear" };
  if (code === 1) return { emoji: "🌤", label: "mostly clear" };
  if (code === 2) return { emoji: "⛅", label: "partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "overcast" };
  if (code === 45 || code === 48) return { emoji: "🌫️", label: "fog" };
  if (code >= 51 && code <= 55) return { emoji: "🌦️", label: "drizzle" };
  if (code >= 61 && code <= 65) return { emoji: "🌧️", label: code >= 65 ? "heavy rain" : "rain" };
  if (code === 66 || code === 67) return { emoji: "🌧️", label: "freezing rain" };
  if (code >= 71 && code <= 77) return { emoji: "🌨️", label: "snow" };
  if (code >= 80 && code <= 82) return { emoji: "🌧️", label: "showers" };
  if (code === 85 || code === 86) return { emoji: "🌨️", label: "snow showers" };
  if (code >= 95) return { emoji: "⛈️", label: "thunderstorm" };
  return { emoji: "🌥", label: "cloudy" };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "America/Los_Angeles",
  });

  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const c = json?.current;
    if (!c || typeof c.temperature_2m !== "number" || typeof c.weather_code !== "number") return null;

    const cond = codeToConditions(c.weather_code, c.is_day === 1);
    const data: WeatherSnapshot = {
      temp_f: Math.round(c.temperature_2m),
      feels_like_f: Math.round(c.apparent_temperature ?? c.temperature_2m),
      emoji: cond.emoji,
      label: cond.label,
      wind_mph: Math.round(c.wind_speed_10m ?? 0),
      wind_cardinal: degToCardinal(c.wind_direction_10m ?? 0),
    };
    cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  } catch {
    return null;
  }
}
