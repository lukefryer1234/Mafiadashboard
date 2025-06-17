import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:3001/api/auth'; // Base URL for auth endpoints

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // { id, email }
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [isLoading, setIsLoading] = useState(true); // Initially true to check for existing token
  const [authError, setAuthError] = useState(null);

  // Effect to load user data if token exists (e.g., on page refresh)
  useEffect(() => {
    const storedUser = localStorage.getItem('authUser');
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (e) {
        console.error("Error parsing stored user:", e);
        localStorage.removeItem('authUser');
        localStorage.removeItem('authToken');
        setToken(null);
        setUser(null); // Ensure user state is also cleared
      }
    }
    setIsLoading(false); // Finished initial load attempt
  }, [token]);

  const storeAuthData = (userData, authToken) => {
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.setItem('authToken', authToken);
    setUser(userData);
    setToken(authToken);
    setAuthError(null);
    axios.defaults.headers.common['Authorization'] = \`Bearer \${authToken}\`; // Set for future requests
  };

  const clearAuthData = useCallback(() => {
    localStorage.removeItem('authUser');
    localStorage.removeItem('authToken');
    setUser(null);
    setToken(null);
    setAuthError(null);
    delete axios.defaults.headers.common['Authorization']; // Clear auth header
  }, []);


  const register = async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const response = await axios.post(\`\${BACKEND_URL}/register\`, { email, password });
      setIsLoading(false);
      return response.data;
    } catch (error) {
      console.error("Registration error:", error.response?.data || error.message);
      const errData = error.response?.data || { message: error.message, errorCode: 'REGISTRATION_CLIENT_ERROR' };
      setAuthError(errData);
      setIsLoading(false);
      throw errData;
    }
  };

  const login = async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const response = await axios.post(\`\${BACKEND_URL}/login\`, { email, password });
      if (response.data && response.data.token && response.data.user) {
        storeAuthData(response.data.user, response.data.token);
      }
      setIsLoading(false);
      return response.data;
    } catch (error) {
      console.error("Login error:", error.response?.data || error.message);
      const errData = error.response?.data || { message: error.message, errorCode: 'LOGIN_CLIENT_ERROR' };
      setAuthError(errData);
      setIsLoading(false);
      throw errData;
    }
  };

  const logout = useCallback(() => {
    console.log("Logging out...");
    clearAuthData();
  }, [clearAuthData]);

  // Set axios default Authorization header when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = \`Bearer \${token}\`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const authContextValue = {
    user,
    token,
    isLoading,
    authError,
    register,
    login,
    logout,
    isAuthenticated: !!token && !!user,
    setAuthError
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};
