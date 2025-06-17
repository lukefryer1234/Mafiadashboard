import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

const LoginPage = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // const [message, setMessage] = useState(''); // Local messages might not be needed if relying on authError
  const { login, authError, isLoading, setAuthError } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // setMessage(''); // Clear local messages
    if(setAuthError) setAuthError(null); // Clear global auth error before new attempt

    if (!email || !password) {
        // This basic validation can be here, or rely on backend/AuthContext
        // For now, let AuthContext's login function handle it to show its error.
        // setMessage("Email and password are required.");
        // return;
    }

    try {
      await login(email, password);
      // On successful login, AuthContext updates isAuthenticated.
      // App.jsx's useEffect will detect this change and switch currentPage to 'dashboard'.
      // So, no need to explicitly navigate or set messages here for success.
    } catch (error) {
      // authError from context is set by the login function if it throws.
      // It will be displayed below.
      console.error("Login Page Submit Error:", error);
      // setMessage(error.error || error.message || 'Login failed. Please check credentials.');
    }
  };

  return (
    <div className="auth-page">
      <h2>Login to Your Account</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="login-email">Email:</label>
          <input
            type="email"
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="login-password">Password:</label>
          <input
            type="password"
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      {/* Display global auth errors from context */}
      {authError && <p className="error-message">Error: {authError.error || authError.message}</p>}
      <p>
        Don't have an account?{' '}
        <button type="button" onClick={onSwitchToRegister} className="link-button">
          Register here
        </button>
      </p>
    </div>
  );
};

export default LoginPage;
