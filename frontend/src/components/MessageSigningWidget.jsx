import React, { useState } from 'react';
import { ethers } from 'ethers';

const MessageSigningWidget = ({ widgetId, onRemove }) => {
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [status, setStatus] = useState(''); // For loading, success, or general status
  const [error, setError] = useState('');

  const handleSignMessage = async () => {
    setError('');
    setSignature('');
    if (!message.trim()) {
      setError('Message cannot be empty.');
      return;
    }

    if (typeof window.ethereum === 'undefined') {
      setError('MetaMask (or another Ethereum wallet) is not installed. Please install it to sign messages.');
      setStatus('');
      return;
    }

    try {
      setStatus('Connecting to wallet...');
      // Request account access if needed
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      setStatus('Waiting for signature in wallet...');
      const signedMessage = await signer.signMessage(message);

      setSignature(signedMessage);
      setStatus('Message signed successfully!');
    } catch (err) {
      console.error('Error signing message:', err);
      setError(`Error: ${err.message || 'User rejected the signature or an unknown error occurred.'}`);
      setStatus('');
    }
  };

  return (
    <div className="message-signing-widget card">
      <h4>Sign Message</h4>
      <div className="widget-content">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter message to sign"
          rows="4"
          disabled={status.startsWith('Waiting') || status.startsWith('Connecting')}
        />
        <button
          onClick={handleSignMessage}
          disabled={status.startsWith('Waiting') || status.startsWith('Connecting')}
          className="sign-button"
        >
          {status.startsWith('Waiting') || status.startsWith('Connecting') ? status : 'Sign Message'}
        </button>

        {error && <p className="widget-error">{error}</p>}
        {status && !error && <p className="widget-status">{status}</p>}

        {signature && (
          <div className="signature-display">
            <p><strong>Signature:</strong></p>
            <textarea
              value={signature}
              readOnly
              rows="3"
              onClick={(e) => e.target.select()} // Select text on click for easy copying
            />
          </div>
        )}
      </div>
      <button onClick={() => onRemove(widgetId)} className="remove-widget-button">
        Remove Widget
      </button>
    </div>
  );
};

export default MessageSigningWidget;
