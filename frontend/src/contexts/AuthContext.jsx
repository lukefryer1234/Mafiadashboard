import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_API_URL = 'http://localhost:3001/api'; // Base for all API calls
const AUTH_URL = \`\${BACKEND_API_URL}/auth\`;

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const clearAuthData = useCallback(() => {
    localStorage.removeItem('authUser');
    localStorage.removeItem('authToken');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setToken(null);
    setAuthError(null); // Clear any standing auth errors
    console.log("AuthContext: Auth data cleared, user logged out.");
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setToken(storedToken);
        axios.defaults.headers.common['Authorization'] = \`Bearer \${storedToken}\`;
        console.log("AuthContext: Auth data loaded from localStorage for user:", parsedUser.email);
      } catch (e) {
        console.error("AuthContext: Error parsing stored user from localStorage:", e);
        clearAuthData(); // Clear corrupted data
      }
    }
    setIsLoading(false);
  }, [clearAuthData]); // Include clearAuthData in deps

  // Setup Axios interceptor for response errors
  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      response => response, // Pass through successful responses
      error => {
        const { config, response } = error;
        if (config && response && (response.status === 401 || response.status === 403)) {
          // Avoid logout loops if the error is from an auth endpoint itself during login/register
          if (config.url && !config.url.includes('/auth/')) {
            console.warn(\`Axios Interceptor: Detected \${response.status} error on API call to '\${config.url}'. Logging out.\`);
            setAuthError({
                message: 'Your session has expired or your token is invalid. Please log in again.',
                errorCode: response.data?.errorCode || (response.status === 401 ? 'SESSION_EXPIRED_UNAUTHORIZED' : 'SESSION_EXPIRED_FORBIDDEN')
            });
            clearAuthData(); // This will set user and token to null, triggering UI changes
          }
        }
        return Promise.reject(error); // Important: still reject the promise so individual calls can catch it
      }
    );

    // Cleanup interceptor on component unmount
    return () => {
      axios.interceptors.response.eject(responseInterceptor);
      console.log("AuthContext: Axios response interceptor ejected.");
    };
  }, [clearAuthData]); // clearAuthData is stable due to useCallback

  const storeAuthData = (userData, authToken) => {
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.setItem('authToken', authToken);
    axios.defaults.headers.common['Authorization'] = \`Bearer \${authToken}\`;
    setUser(userData);
    setToken(authToken);
    setAuthError(null);
    console.log("AuthContext: Auth data stored for user:", userData.email);
  };

  const register = async (email, password) => {
    setIsLoading(true); setAuthError(null);
    try {
      const response = await axios.post(\`\${AUTH_URL}/register\`, { email, password });
      setIsLoading(false);
      return response.data; // e.g., { message, userId, email }
    } catch (error) {
      const errData = error.response?.data || { message: error.message, errorCode: 'REGISTRATION_FAILED_CLIENT' };
      console.error("AuthContext: Registration error:", errData);
      setAuthError(errData);
      setIsLoading(false);
      throw errData; // Re-throw for component to handle if needed
    }
  };

  const login = async (email, password) => {
    setIsLoading(true); setAuthError(null);
    try {
      const response = await axios.post(\`\${AUTH_URL}/login\`, { email, password });
      if (response.data && response.data.token && response.data.user) {
        storeAuthData(response.data.user, response.data.token);
      }
      setIsLoading(false);
      return response.data;
    } catch (error) {
      const errData = error.response?.data || { message: error.message, errorCode: 'LOGIN_FAILED_CLIENT' };
      console.error("AuthContext: Login error:", errData);
      setAuthError(errData);
      setIsLoading(false);
      throw errData; // Re-throw for component to handle
    }
  };

  const logout = useCallback(() => {
    console.log("AuthContext: logout() called.");
    clearAuthData();
    // No backend call needed for stateless JWT logout by default
  }, [clearAuthData]);

  // No separate useEffect for setting axios header with token, as it's done in storeAuthData and initial load.
  // And clearAuthData removes it.

  const authContextValue = {
    user,
    token,
    isLoading,
    authError,
    register,
    login,
    logout,
    isAuthenticated: !!token && !!user,
    setAuthError // Expose to allow components to clear/set auth errors manually if needed
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
