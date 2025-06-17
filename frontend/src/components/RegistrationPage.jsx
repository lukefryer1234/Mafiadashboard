import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

const RegistrationPage = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(''); // For success/error messages from this page
  const { register, authError, isLoading, setAuthError } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if(setAuthError) setAuthError(null); // Clear global auth errors if function exists

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
        setMessage('Password must be at least 6 characters long.');
        return;
    }

    try {
      const response = await register(email, password);
      setMessage('Registration successful for ' + response.email + '! You can now log in.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      // Consider calling onSwitchToLogin() here or after a short delay
      // setTimeout(() => onSwitchToLogin(), 2000);
    } catch (error) {
      // authError from context is set by the register function if it throws.
      // We can display it directly or set a local message.
      // If authError is already set by context, no need to set local message unless for specific UI.
      console.error("Registration Page Submit Error:", error);
      // setMessage(error.error || error.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="auth-page">
      <h2>Register New Account</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="register-email">Email:</label>
          <input
            type="email"
            id="register-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="register-password">Password:</label>
          <input
            type="password"
            id="register-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength="6"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="register-confirm-password">Confirm Password:</label>
          <input
            type="password"
            id="register-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength="6"
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Registering...' : 'Register'}
        </button>
      </form>
      {message && <p className="page-message" style={{ color: message.startsWith('Registration successful') ? 'green' : 'red' }}>{message}</p>}
      {/* Display global authError from context if it exists and no local message is more specific */}
      {authError && !message && <p className="error-message">Error: {authError.error || authError.message}</p>}
      <p>
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin} className="link-button">
          Login here
        </button>
      </p>
    </div>
  );
};

export default RegistrationPage;
