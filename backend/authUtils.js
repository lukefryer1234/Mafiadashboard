const bcrypt = require('bcryptjs');

const saltRounds = 10; // Or a value from process.env for configurability

/**
 * Hashes a plain text password.
 * @param {string} password The plain text password.
 * @returns {Promise<string>} A promise that resolves to the hashed password.
 */
async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    console.error('[AUTH_UTILS_ERROR] Error hashing password:', error);
    throw new Error('Password hashing failed.'); // Propagate a generic error
  }
}

/**
 * Compares a plain text password with a stored hash.
 * @param {string} password The plain text password to compare.
 * @param {string} storedHash The stored hashed password.
 * @returns {Promise<boolean>} A promise that resolves to true if passwords match, false otherwise.
 */
async function comparePassword(password, storedHash) {
  try {
    // Ensure storedHash is a string, as bcrypt expects. null or undefined will cause errors.
    if (typeof storedHash !== 'string') {
        console.warn('[AUTH_UTILS_WARN] storedHash is not a string for comparison. Returning false.');
        return false;
    }
    const isMatch = await bcrypt.compare(password, storedHash);
    return isMatch;
  } catch (error) {
    console.error('[AUTH_UTILS_ERROR] Error comparing password:', error);
    // In case of bcrypt error (e.g., malformed hash), it's safer to return false
    // or throw a specific error if you want to differentiate system errors from non-matches.
    // For security, typically you wouldn't reveal that a hash was malformed to the user.
    return false;
  }
}

module.exports = {
  hashPassword,
  comparePassword,
};
