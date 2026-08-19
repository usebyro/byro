import axios from "axios";

// Normalize the base URL: strip trailing slashes then append /api/
// NEXT_PUBLIC_API_URL should be the server root (e.g. https://byro.onrender.com)
const _rawBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const API_BASE_URL = _rawBase.endsWith("/api") ? _rawBase + "/" : _rawBase + "/api/";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
});

// Custom method defined *outside* the config object
axiosInstance.createEvent = (eventData) =>
  axiosInstance.post("events/", eventData, {
    headers: {
      "Content-Type": "multipart/form-data", // Required for file uploads
    },
  });

// Normalize token function (same as in api.js)
const normalizeToken = (token) => {
  if (!token) return null;
  if (typeof token === "object") {
    // Handle backend response format: { access: "...", refresh: "..." }
    // Also handle other common formats
    token = token.access || token.access_token || token.accessToken || token.token || token?.idToken || "";
  }
  token = String(token).trim();
  if (!token) return null;
  return token.startsWith("Bearer ") ? token.slice(7).trim() : token;
};

// Request interceptor for auth token and common headers
axiosInstance.interceptors.request.use(
  (config) => {
    // For FormData, remove Content-Type to let axios set it with boundary
    if (config.data instanceof FormData) {
      // Remove any Content-Type header - axios will set it automatically with boundary
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }

    // Check if Authorization header is already set (from api.js setAuthToken)
    if (config.headers.Authorization || axiosInstance.defaults.headers.common["Authorization"]) {
      // Header already set, just ensure Content-Type (but don't override FormData)
      if (!config.headers["Content-Type"] && !(config.data instanceof FormData)) {
        config.headers["Content-Type"] = "application/json";
      }
      return config;
    }

    // Try multiple keys because different parts of the app may store the token differently
    let token = null;
    
    // Try authToken first (most reliable, set by API.setAuthToken)
    token = localStorage.getItem("authToken");
    
    // If not found, try token from Redux (might be JSON string)
    if (!token) {
      try {
        const persistedToken = localStorage.getItem("token");
        if (persistedToken) {
          // Try to parse as JSON first (Redux persist stores as JSON)
          try {
            const parsed = JSON.parse(persistedToken);
            token = normalizeToken(parsed);
          } catch (parseError) {
            // If parsing fails, treat as plain string
            token = normalizeToken(persistedToken);
          }
        }
      } catch (error) {
        console.error("Error retrieving token from localStorage:", error);
      }
    }

    // Try accessToken as fallback
    if (!token) {
      token = normalizeToken(localStorage.getItem("accessToken"));
    }

    // Normalize and set token
    const normalizedToken = normalizeToken(token);
    if (normalizedToken) {
      config.headers.Authorization = `Bearer ${normalizedToken}`;
    }
    
    // Don't override Content-Type for FormData - axios will set it with boundary
    // Only set Content-Type if it's not already set and it's not FormData
    if (!(config.data instanceof FormData) && !config.headers["Content-Type"]) {
      config.headers["Content-Type"] = "application/json";
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const forceSignOut = (config) => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("authToken");
  localStorage.removeItem("token");

  if (typeof window !== "undefined") {
    import("../redux/store").then(({ store }) => {
      import("../redux/auth/authSlice").then(({ signOut }) => {
        store.dispatch(signOut());
      });
    });
    // Only redirect if this was not already a login/auth request
    const url = config?.url || "";
    if (!url.includes("auth/") && !url.includes("token/") && !url.includes("my_ticket")) {
      window.location.href = "/";
    }
  }
};

// Shared across concurrent 401s so only one refresh call is ever in flight.
let refreshPromise = null;

const refreshAccessToken = () => {
  if (!refreshPromise) {
    let refreshToken = null;
    try {
      const stored = JSON.parse(localStorage.getItem("token") || "null");
      refreshToken = stored?.refresh || null;
    } catch {
      refreshToken = null;
    }

    if (!refreshToken) {
      refreshPromise = Promise.reject(new Error("No refresh token available"));
    } else {
      // Plain axios, not axiosInstance, so this call never re-enters these interceptors.
      refreshPromise = axios
        .post(`${API_BASE_URL}auth/refresh/`, { refresh_token: refreshToken })
        .then(({ data }) => {
          const tokens = { access: data.tokens.access, refresh: data.tokens.refresh || refreshToken };
          localStorage.setItem("authToken", tokens.access);
          localStorage.setItem("token", JSON.stringify(tokens));
          axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${tokens.access}`;
          return tokens.access;
        });
    }
    refreshPromise.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

// Response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    // Only login/registration/refresh endpoints should be excluded from the
    // refresh-and-retry path — everything else under auth/ (e.g. auth/me/)
    // is a normal authenticated call and a 401 there just means the access
    // token needs refreshing, per the backend's contract.
    const NO_REFRESH_ROUTES = [
      "auth/oauth/callback/",
      "auth/magic/send/",
      "auth/magic/verify/",
      "auth/privy/",
      "auth/refresh/",
    ];
    const isAuthRoute = NO_REFRESH_ROUTES.some((route) => (config?.url || "").includes(route));

    if (response?.status === 401 && config && !config._retry && !isAuthRoute) {
      config._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        config.headers = config.headers || {};
        config.headers["Authorization"] = `Bearer ${accessToken}`;
        return axiosInstance(config);
      } catch {
        forceSignOut(config);
        return Promise.reject(error);
      }
    }

    if (response?.status === 401) {
      forceSignOut(config);
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
