let token: string | null = null;
let refreshPromise: Promise<void> | null = null;
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (typeof window !== "undefined") {
  token = localStorage.getItem("auth_token");
}

export const getToken = (): string | null => {
  if (typeof window !== "undefined" && !token) {
    token = localStorage.getItem("auth_token");
  }
  return token;
};

export const setToken = (newToken: string) => {
  token = newToken;
  if (typeof window !== "undefined") {
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("auth_token_issued_at", Date.now().toString());
  }
};

export const clearToken = () => {
  token = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_token_issued_at");
  }
};

export const getRefreshThreshold = () => REFRESH_THRESHOLD_MS;

export const refreshTokenSilently = async (baseURL: string): Promise<void> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const url = `${baseURL}/refresh`;
      const currentToken = getToken();

      if (!currentToken) return;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          setToken(data.token);
        }
      } else {
        clearToken();
      }
    } catch (error) {
      console.error("Silent token refresh failed:", error);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};
