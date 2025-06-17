import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import axios from 'axios';
import './App.css';
import BasicChart from './components/BasicChart';
import { AuthContext } from './contexts/AuthContext';
import RegistrationPage from './components/RegistrationPage';
import LoginPage from './components/LoginPage'; // Import LoginPage

const BACKEND_URL = 'http://localhost:3001';
const WEBSOCKET_URL = 'ws://localhost:3001';

// Helper to prepare chart data (assuming it's defined as in previous step)
const prepareChartJsData = (inputData, label, defaultTitle, customColor) => {
  if (Array.isArray(inputData) && inputData.every(item => typeof item === 'number' || (typeof item === 'string' && !isNaN(parseFloat(item))))) {
    const numericData = inputData.map(item => typeof item === 'string' ? parseFloat(item) : item).filter(item => !isNaN(item));
    if (numericData.length === 0) return null;
    return {
      labels: numericData.map((_, index) => \`Point \${index + 1}\`),
      datasets: [ { label: label || defaultTitle || 'Values', data: numericData, backgroundColor: customColor ? customColor.bg : 'rgba(75,192,192,0.5)', borderColor: customColor ? customColor.border : 'rgba(75,192,192,1)', borderWidth: 1, } ],
    };
  } else if (typeof inputData === 'object' && inputData !== null && inputData.labels && inputData.datasets) {
    return inputData;
  }
  return null;
};


function App() {
  const { user, logout, isAuthenticated, isLoading: authIsLoading, authError } = useContext(AuthContext);
  const [currentPage, setCurrentPage] = useState('login'); // Default to login

  // App-specific states
  const [latestBlock, setLatestBlock] = useState(null);
  const [blockError, setBlockError] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [contractName, setContractName] = useState('');
  const [contractAbi, setContractAbi] = useState('');
  const [abiSubmissionStatus, setAbiSubmissionStatus] = useState('');
  const [isAbiReady, setIsAbiReady] = useState(false);
  const [readOnlyFunctions, setReadOnlyFunctions] = useState([]);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [contractData, setContractData] = useState(null);
  const [fetchDataStatus, setFetchDataStatus] = useState('');
  const [storedContracts, setStoredContracts] = useState([]);
  const [listContractsError, setListContractsError] = useState('');
  const [selectedFunctionIndex, setSelectedFunctionIndex] = useState('');
  const [functionInputs, setFunctionInputs] = useState({});
  const [genericCallResult, setGenericCallResult] = useState(null);
  const [genericCallStatus, setGenericCallStatus] = useState('');
  const [selectedEvents, setSelectedEvents] = useState({});
  const [eventListeningStatus, setEventListeningStatus] = useState('');
  const wsRef = useRef(null);
  const [wsConnectionStatus, setWsConnectionStatus] = useState('Disconnected');
  const [liveEventMessages, setLiveEventMessages] = useState([]);
  const [activeWsSubscriptions, setActiveWsSubscriptions] = useState({});
  const [showGenericResultAsChart, setShowGenericResultAsChart] = useState(false);
  const [eventFrequencies, setEventFrequencies] = useState({});

  const resetAppSpecificStates = useCallback(() => {
    console.log("Resetting ALL app specific states (dashboard related).");
    setContractAddress('');
    setContractName('');
    setContractAbi('');
    setAbiSubmissionStatus(''); setIsAbiReady(false);
    setReadOnlyFunctions([]); setAvailableEvents([]);
    setSelectedFunctionIndex(''); setFunctionInputs({});
    setGenericCallResult(null); setGenericCallStatus('');
    setSelectedEvents({}); setEventListeningStatus('');
    setLiveEventMessages([]); setActiveWsSubscriptions({});
    setShowGenericResultAsChart(false); setEventFrequencies({});
    setContractData(null); setFetchDataStatus('');
    setStoredContracts([]); setListContractsError('');
    // Note: Does not clear latestBlock/blockError as they are global, not user/contract specific.
    // Note: Does not clear authError from AuthContext.
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      if (currentPage !== 'dashboard') {
        setCurrentPage('dashboard');
      }
    } else {
      // If not authenticated, ensure app specific states are cleared
      // and ensure user is on an auth page (login or register).
      resetAppSpecificStates();
      if (currentPage === 'dashboard' || currentPage === '') { // If they were on dashboard or uninitialized
          setCurrentPage('login');
      } // Otherwise, they might be on 'register', let them stay.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, resetAppSpecificStates]); // currentPage removed to avoid loops, resetAppSpecificStates is stable

  const parseAndStoreAbiElements = useCallback((abiString) => {
    setEventFrequencies({});
    try {
      const parsedAbi = JSON.parse(abiString);
      if (!Array.isArray(parsedAbi)) { setAbiSubmissionStatus('Error: ABI not array.'); setIsAbiReady(false); return false; }
      const funcs = parsedAbi.map((item,i)=>({...item,id:i})).filter(item=>item.type==='function'&&(item.stateMutability==='view'||item.stateMutability==='pure')).map(f=>({id:f.id,name:f.name,inputs:f.inputs||[],outputs:f.outputs||[]}));
      const evs = parsedAbi.map((item,i)=>({...item,id:i})).filter(item=>item.type==='event').map(e=>({id:e.id,name:e.name,inputs:e.inputs||[],anonymous:e.anonymous||false}));
      setReadOnlyFunctions(funcs); setAvailableEvents(evs); setIsAbiReady(true);
      setAbiSubmissionStatus('ABI parsed. Functions & Events extracted.'); return true;
    } catch (e) { setAbiSubmissionStatus(\`ABI Parse Error: \${e.message}\`); setIsAbiReady(false); return false; }
  }, []);

  useEffect(() => { // Re-parse ABI when contractAbi or contractAddress changes
    if (contractAbi && contractAddress) {
        parseAndStoreAbiElements(contractAbi);
    } else if (!contractAddress || !contractAbi) {
        setIsAbiReady(false); setReadOnlyFunctions([]);
        setAvailableEvents([]); setSelectedEvents({});
        setEventFrequencies({});
    }
  }, [contractAbi, contractAddress, parseAndStoreAbiElements]);

  useEffect(() => { // WebSocket effect (condensed for brevity)
    if (!contractAddress || !isAbiReady) { if (wsRef.current) wsRef.current.close(); return; }
    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) { /* ... connect logic ... */ }
    return () => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(); wsRef.current = null; };
  }, [contractAddress, isAbiReady]);

  useEffect(() => { // Initial data fetch for latest block
    const fetchLatestBlock = async () => {
      try { const res = await axios.get(\`\${BACKEND_URL}/api/latest-block\`); setLatestBlock(res.data.latestBlockNumber); }
      catch (err) { console.error("Err fetching block:",err); setBlockError('Failed to fetch blockchain status.'); }
    };
    fetchLatestBlock();
  }, []);

  const fetchStoredContracts = useCallback(async () => {
    setListContractsError('');
    try { const res = await axios.get(\`\${BACKEND_URL}/api/contracts\`); setStoredContracts(res.data); }
    catch (err) {
      console.error("Err fetching stored contracts:", err.response?.data || err.message);
      setListContractsError(err.response?.data?.error || 'Failed to fetch stored contracts.');
    }
  }, []); // No dependencies as token is handled by axios defaults from AuthContext

  useEffect(() => { // Fetch stored contracts when user is authenticated and on dashboard
    if (isAuthenticated && currentPage === 'dashboard') {
      fetchStoredContracts();
    }
  }, [isAuthenticated, currentPage, fetchStoredContracts]);


  // --- Event Handlers (condensed for brevity) ---
  const handleAddressChange = (event) => { setContractAddress(event.target.value); resetAppSpecificStates(); };
  const handleNameChange = (event) => { setContractName(event.target.value); };
  const handleAbiChange = (event) => { setContractAbi(event.target.value); if (!event.target.value) resetAppSpecificStates(); };
  const handleSubmitAbi = async () => { /* ... */ };
  const handleFetchData = async () => { /* ... */ };
  const handleSelectContract = useCallback(async (selectedAddress) => {
    resetAppSpecificStates(); setContractAddress(selectedAddress);
    setAbiSubmissionStatus(\`Loading ABI for \${selectedAddress}...\`);
    try {
        const res = await axios.get(\`\${BACKEND_URL}/api/contract/abi/\${selectedAddress}\`);
        if (res.data && res.data.abi) {
            const abiStr = typeof res.data.abi === 'string' ? res.data.abi : JSON.stringify(res.data.abi, null, 2);
            setContractName(res.data.name || ''); setContractAbi(abiStr);
        } else { setAbiSubmissionStatus(\`ABI not found for \${selectedAddress}.\`); setIsAbiReady(false); }
    } catch (error) { setAbiSubmissionStatus(\`Error loading ABI: \${error.response?.data?.error || error.message}\`); setIsAbiReady(false); }
  }, [resetAppSpecificStates]);
  const handleFunctionSelect = (event) => { /* ... */ };
  const handleFunctionInputChange = (inputName, value) => { /* ... */ };
  const handleCallGenericFunction = async () => { /* ... */ };
  const handleEventSelectionChange = (eventName) => { /* ... */ };
  const handleToggleListening = () => { /* ... */ };

  // --- Prepare chart data (condensed) ---
  const genericCallChartData = prepareChartJsData(genericCallResult, /* ... */);
  const eventFrequencyChartData = prepareChartJsData({ labels: Object.keys(eventFrequencies), datasets: [/* ... */] }, /* ... */);

  // --- Page rendering logic ---
  const renderPage = () => {
    if (authIsLoading && !user) {
        return <div className="card"><p>Checking authentication status...</p></div>;
    }

    if (!isAuthenticated) {
      if (currentPage === 'register') {
        return <RegistrationPage onSwitchToLogin={() => setCurrentPage('login')} />;
      }
      return <LoginPage onSwitchToRegister={() => setCurrentPage('register')} />;
    }

    // Authenticated: Show Dashboard
    return (
        <>
          <div className="card user-status">
            <p>Logged in as: <strong>{user.email}</strong> (ID: {user.id})</p>
            <button onClick={() => { logout(); /* resetAppSpecificStates and page switch handled by useEffect [isAuthenticated] */ }}>Logout</button>
          </div>

          <div className="card"><p>WebSocket: <strong style={{color: wsConnectionStatus === 'Connected'?'green':(wsConnectionStatus.startsWith('Error')||wsConnectionStatus === 'Disconnected'?'red':'orange')}}>{wsConnectionStatus}</strong></p></div>
          <div className="card"><h2>Blockchain Status</h2>{blockError && <p style={{color:'red'}}>{blockError}</p>}{latestBlock ? <p>Latest Block: <strong>{latestBlock}</strong></p> : <p>Loading...</p>}</div>

          <div className="card"><h2>Your Stored Contracts</h2>
            {listContractsError && <p style={{ color: 'red' }}>{listContractsError}</p>}
            {storedContracts.length > 0 ? (
              <ul> {storedContracts.map(c => <li key={c.address}><strong>{c.name || 'Unnamed'}</strong> ({c.address.slice(0,6)}...{c.address.slice(-4)}) <button onClick={()=>handleSelectContract(c.address)}>Load</button></li>)} </ul>
            ) : <p>No contracts stored for your account yet. Add one below.</p>}
            <button onClick={fetchStoredContracts} disabled={authIsLoading || !isAuthenticated}>Refresh List</button>
          </div>

          <div className="card"><h2>Monitor New or Update Existing Contract</h2>{/* ... form ... */}</div>

          {isAbiReady && contractAddress && (
            <>
              <div className="card"><h2>Standard Data</h2>{/* ... content ... */}</div>
              <div className="card"><h2>Generic Function Calls</h2>{/* ... content ... */}</div>
              <div className="card"><h2>Event Listening for {contractAddress.slice(0,10)}...</h2>{/* ... content ... */}</div>
            </>
          )}
          {(!isAbiReady || !contractAddress) && isAuthenticated && (
             <div className="card"><p>Select a stored contract or add a new one to interact with it.</p></div>
          )}
        </>
    );
  };

  return (
    <div className="App">
      <h1>PulseChain Dashboard</h1>
      {renderPage()}
      <style jsx global>{` /* ... global styles from previous step ... */ `}</style>
    </div>
  );
}
export default App;
