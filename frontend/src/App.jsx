import { useState, useEffect, useRef } from 'react'; // Added useRef
import axios from 'axios';
import './App.css';

const BACKEND_URL = 'http://localhost:3001';
const WEBSOCKET_URL = 'ws://localhost:3001';

function App() {
  // --- Existing States ---
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

  // --- WebSocket State ---
  const wsRef = useRef(null);
  const [wsConnectionStatus, setWsConnectionStatus] = useState('Disconnected');
  const [liveEventMessages, setLiveEventMessages] = useState([]);
  const [activeWsSubscriptions, setActiveWsSubscriptions] = useState({}); // { eventName: true }

  // --- WebSocket Connection Effect ---
  useEffect(() => {
    if (!contractAddress || !isAbiReady) {
        if (wsRef.current) {
            console.log("Closing WebSocket due to no active contract/ABI or address cleared.");
            wsRef.current.close();
            // wsRef.current = null; // onclose will handle this
        }
        setWsConnectionStatus('Disconnected (Contract/ABI not ready)');
        setActiveWsSubscriptions({}); // Clear active subscriptions
        return;
    }

    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
      console.log('Attempting to connect WebSocket...');
      setWsConnectionStatus('Connecting...');
      const socket = new WebSocket(WEBSOCKET_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket Connected');
        setWsConnectionStatus('Connected');
        // Optionally, re-send current subscriptions if ws had to reconnect
        // For now, subscriptions are managed manually via button after connection.
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket Message Received:', message);
          if (message.type === 'EVENT_DATA') {
            setLiveEventMessages(prev => [message.payload, ...prev.slice(0, 49)]); // Keep last 50
          } else if (message.type === 'SUBSCRIPTION_ACK' && message.payload.status === 'subscribed') {
            setActiveWsSubscriptions(prev => ({ ...prev, [message.payload.eventName]: true }));
            setEventListeningStatus(\`Subscribed to \${message.payload.eventName}\`);
          } else if (message.type === 'UNSUBSCRIPTION_ACK' && message.payload.status === 'unsubscribed') {
            setActiveWsSubscriptions(prev => ({ ...prev, [message.payload.eventName]: false }));
            setEventListeningStatus(\`Unsubscribed from \${message.payload.eventName}\`);
          } else if (message.type === 'SUBSCRIPTION_ERROR') {
            setEventListeningStatus(\`Subscription Error for \${message.payload.eventName}: \${message.payload.error}\`);
          } else if (message.type === 'connection_ack') {
            setEventListeningStatus(\`WebSocket: \${message.message}\`);
          } else {
            setEventListeningStatus(\`WS Message: \${message.type} - \${message.message || JSON.stringify(message.payload)}\`);
          }
        } catch (e) {
          console.error('Error processing WebSocket message:', e, "Data:", event.data);
          setLiveEventMessages(prev => [{eventName: "Processing Error", args:{error: "Error processing message from server.", rawData: event.data.substring(0,100)}}, ...prev.slice(0,49)]);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        setWsConnectionStatus('Error communicating with WebSocket server.');
        // wsRef.current = null; // onclose will handle setting ref to null
      };

      socket.onclose = (event) => {
        console.log('WebSocket Disconnected. Code:', event.code, 'Reason:', event.reason);
        setWsConnectionStatus('Disconnected');
        wsRef.current = null;
        setActiveWsSubscriptions({});
      };
    }

    return () => { // Cleanup function
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket connection on cleanup (e.g. component unmount or deps change).');
        wsRef.current.close();
      }
      // wsRef.current = null; // Already handled by onclose generally
    };
  }, [contractAddress, isAbiReady]);


  // --- Other useEffects and handlers ---
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const blockResponse = await axios.get(\`\${BACKEND_URL}/api/latest-block\`);
        setLatestBlock(blockResponse.data.latestBlockNumber); setBlockError('');
      } catch (err) { console.error("Error fetching latest block:", err); setBlockError('Failed to fetch blockchain status.'); }
      fetchStoredContracts();
    };
    fetchInitialData();
  }, []);

  const fetchStoredContracts = async () => {
    setListContractsError('');
    try {
      const response = await axios.get(\`\${BACKEND_URL}/api/contracts\`);
      setStoredContracts(response.data);
    } catch (err) { console.error("Error fetching stored contracts:", err); setListContractsError('Failed to fetch stored contracts list.'); }
  };

  const resetSubmissionStates = () => {
    setAbiSubmissionStatus(''); setIsAbiReady(false);
    setContractData(null); setFetchDataStatus('');
    setReadOnlyFunctions([]); setAvailableEvents([]);
    setSelectedFunctionIndex('');
    setFunctionInputs({}); setGenericCallResult(null); setGenericCallStatus('');
    setSelectedEvents({}); setEventListeningStatus('');
    setLiveEventMessages([]); setActiveWsSubscriptions({});
    // If WebSocket is open and contractAddress/isAbiReady changes to make it invalid,
    // the useEffect for WebSocket connection will handle closing it.
  };

  const parseAndStoreAbiElements = (abiString) => {
    try {
      const parsedAbi = JSON.parse(abiString);
      if (!Array.isArray(parsedAbi)) {
        setAbiSubmissionStatus('Error: ABI is not a valid JSON array.');
        setIsAbiReady(false); setReadOnlyFunctions([]); setAvailableEvents([]); return false;
      }
      const funcs = parsedAbi.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.type === 'function' && (item.stateMutability === 'view' || item.stateMutability === 'pure')).map(func => ({ id: func.originalIndex, name: func.name, inputs: func.inputs || [], outputs: func.outputs || [] }));
      const evs = parsedAbi.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.type === 'event').map(ev => ({ id: ev.originalIndex, name: ev.name, inputs: ev.inputs || [], anonymous: ev.anonymous || false }));
      setReadOnlyFunctions(funcs); setAvailableEvents(evs); setIsAbiReady(true);
      setAbiSubmissionStatus('ABI parsed. Functions & Events extracted.'); return true;
    } catch (e) {
      console.error("Error parsing ABI:", e);
      setAbiSubmissionStatus(\`Error: Invalid ABI JSON - \${e.message}\`);
      setIsAbiReady(false); setReadOnlyFunctions([]); setAvailableEvents([]); return false;
    }
  };

  const handleAddressChange = (event) => { setContractAddress(event.target.value); resetSubmissionStates(); };
  const handleNameChange = (event) => { setContractName(event.target.value); };
  const handleAbiChange = (event) => { setContractAbi(event.target.value); resetSubmissionStates(); };

  const handleSubmitAbi = async () => {
     if (!contractAddress.trim() || !contractAbi.trim()) { setAbiSubmissionStatus('Error: Address and ABI are required.'); setIsAbiReady(false); return; }
    if (!parseAndStoreAbiElements(contractAbi)) return;
    setAbiSubmissionStatus('Submitting ABI to backend...');
    try {
      const res = await axios.post(\`\${BACKEND_URL}/api/contract/abi\`, { address: contractAddress, abi: contractAbi, name: contractName });
      setAbiSubmissionStatus(\`Backend: \${res.data.message}. Client: ABI elements parsed.\`);
      fetchStoredContracts();
    } catch (error) {
      let errorMsg = \`Client: ABI elements parsed. Backend submission error: \`;
      if (error.response) errorMsg += error.response.data.error || 'Failed to submit ABI';
      else if (error.request) errorMsg += 'No server response.';
      else errorMsg += error.message;
      setAbiSubmissionStatus(errorMsg);
      console.error("Error submitting ABI to backend:", error);
    }
  };

  const handleFetchData = async () => { /* ... implementation from previous step ... */ };
  const handleSelectContract = async (selectedAddress) => { /* ... implementation from previous step ... */
      setContractAddress(selectedAddress); setContractAbi(''); setContractName(''); resetSubmissionStates();
      setAbiSubmissionStatus(\`Loading ABI for \${selectedAddress}...\`);
      try {
        const res = await axios.get(\`\${BACKEND_URL}/api/contract/abi/\${selectedAddress}\`);
        if (res.data && res.data.abi) {
            const abiStr = typeof res.data.abi === 'string' ? res.data.abi : JSON.stringify(res.data.abi, null, 2);
            setContractAbi(abiStr); setContractName(res.data.name || '');
            parseAndStoreAbiElements(abiStr);
        } else {
             setAbiSubmissionStatus(\`Error: ABI data not found in response for \${selectedAddress}.\`);
             setIsAbiReady(false); setReadOnlyFunctions([]); setAvailableEvents([]);
        }
    } catch (error) {
        setAbiSubmissionStatus(\`Error loading ABI: \${error.response?.data?.error || error.message}\`);
        setIsAbiReady(false); setReadOnlyFunctions([]); setAvailableEvents([]);
        console.error("Error loading ABI for selected contract:", error);
    }
  };
  const handleFunctionSelect = (event) => { /* ... implementation from previous step ... */ };
  const handleFunctionInputChange = (inputName, value) => { /* ... implementation from previous step ... */ };
  const handleCallGenericFunction = async () => { /* ... implementation from previous step ... */ };
  const handleEventSelectionChange = (eventName) => { setSelectedEvents(prev => ({...prev, [eventName]: !prev[eventName]})); };

  const handleToggleListening = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setEventListeningStatus("WebSocket not connected. Ensure ABI is loaded and contract address set.");
      return;
    }

    const eventsToToggle = Object.entries(selectedEvents)
      .filter(([_, isSelectedUi]) => isSelectedUi) // User wants these selected based on checkbox
      .map(([eventName, _]) => eventName);

    if (eventsToToggle.length === 0) {
      // If nothing is selected in UI, maybe user wants to unsubscribe from all *active* subscriptions?
      // For now, let's require explicit unchecking and then toggling.
      // Or, this button could be "Update Subscriptions based on Checkboxes"
      const activeSubs = Object.keys(activeWsSubscriptions).filter(key => activeWsSubscriptions[key]);
      if (activeSubs.length > 0) {
         setEventListeningStatus(\`Processing unsubscription for all active: \${activeSubs.join(', ')} (because nothing is checked now)...\`);
         activeSubs.forEach(eventName => {
            console.log(\`Sending UNSUBSCRIBE for \${eventName} on \${contractAddress}\`);
            wsRef.current.send(JSON.stringify({ type: 'UNSUBSCRIBE', payload: { contractAddress, eventName } }));
         });
      } else {
        setEventListeningStatus("No events selected in checkboxes and no active subscriptions to toggle.");
      }
      return;
    }

    setEventListeningStatus(\`Processing subscriptions for: \${eventsToToggle.join(', ')}...\`);

    eventsToToggle.forEach(eventName => {
      const isCurrentlySubscribed = activeWsSubscriptions[eventName]; // Based on ACKs
      // If checkbox is selected and not actively subscribed, subscribe.
      // If checkbox is selected but already actively subscribed, (re-subscribe or do nothing, depends on desired logic, for now, re-send subscribe)
      // The backend's addSubscription is idempotent for client tracking, but resends ACK.
      // Ethers listener is shared, so it won't duplicate that.
      // For unsubscription, we'd need a different trigger or rely on unchecking then toggling.
      // The current logic: if a box is checked, it ensures a SUBSCRIBE message is sent.
      // If a box is *unchecked* and then "Toggle" is clicked, that event won't be in eventsToToggle.
      // So, this button becomes "Apply Selected Subscriptions". We need another way to unsubscribe events
      // that were previously selected but are now un-checked.
      // Let's adjust: iterate all *available* events. If checked & not active -> subscribe. If unchecked & active -> unsubscribe.

      if (!isCurrentlySubscribed) { // Only send SUBSCRIBE if not already active
        console.log(\`Sending SUBSCRIBE for \${eventName} on \${contractAddress}\`);
        wsRef.current.send(JSON.stringify({ type: 'SUBSCRIBE', payload: { contractAddress, eventName } }));
      } else {
        console.log(\`Already actively subscribed to \${eventName}, no SUBSCRIBE message sent.\`);
      }
    });

    // Now handle unsubscriptions for events that are active but no longer selected in checkboxes
    Object.keys(activeWsSubscriptions).forEach(eventName => {
        if (activeWsSubscriptions[eventName] && !selectedEvents[eventName]) { // Active but checkbox is now unchecked
            console.log(\`Sending UNSUBSCRIBE for (due to unchecking): \${eventName} on \${contractAddress}\`);
            wsRef.current.send(JSON.stringify({ type: 'UNSUBSCRIBE', payload: { contractAddress, eventName } }));
        }
    });
  };

  // --- JSX ---
  const currentSelectedFunction = selectedFunctionIndex !== '' ? readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex) : null;
  return (
    <>
      <h1>PulseChain Dashboard</h1>
      <div className="card">
        <p>WebSocket Status: <strong style={{color: wsConnectionStatus === 'Connected' ? 'green' : (wsConnectionStatus.startsWith('Error') || wsConnectionStatus === 'Disconnected' ? 'red' : 'orange')}}>{wsConnectionStatus}</strong></p>
      </div>
      {/* ... other cards: Blockchain Status, Stored Contracts, Monitor Contract ... */}
      {/* These should use the concise versions from the prompt if no changes needed */}
      <div className="card"><h2>Blockchain Status</h2>{blockError && <p style={{ color: 'red' }}>{blockError}</p>}{latestBlock ? <p>Latest Block: <strong>{latestBlock}</strong></p> : <p>Loading...</p>}</div>
      <div className="card"><h2>Stored Contracts</h2>{listContractsError && <p style={{color: 'red'}}>{listContractsError}</p>}{storedContracts.length > 0 ? (<ul> {storedContracts.map(c => <li key={c.address}><strong>{c.name || 'Unnamed'}</strong> ({c.address.slice(0,6)}...{c.address.slice(-4)}) <button onClick={()=>handleSelectContract(c.address)}>Load</button></li>)} </ul>) : <p>No contracts stored.</p>}<button onClick={fetchStoredContracts}>Refresh List</button></div>
      <div className="card"><h2>Monitor Contract</h2><div><label>Address: <input type="text" value={contractAddress} onChange={handleAddressChange} style={{width: "90%"}} /></label></div><div><label>Name: <input type="text" value={contractName} onChange={handleNameChange} style={{width: "90%"}} /></label></div><div><label>ABI (JSON): <textarea value={contractAbi} onChange={handleAbiChange} rows={3} style={{width: "95%"}} /></label></div><button onClick={handleSubmitAbi}>Save ABI & Parse</button>{abiSubmissionStatus && <p style={{color: abiSubmissionStatus.includes('Error:') ? 'red' : 'green'}}>{abiSubmissionStatus}</p>}</div>


      {isAbiReady && contractAddress && (
        <>
          {/* <div className="card"> Standard Data card ... </div> */}
          {/* <div className="card"> Generic Function Calls card ... </div> */}
           <div className="card"><h2>Standard Data</h2><button onClick={handleFetchData} disabled={!contractAddress}>Fetch (Name, Symbol)</button>{fetchDataStatus && <p>{fetchDataStatus}</p>}{contractData && (<div><h3>Data for {contractData.address.slice(0,10)}...</h3>{contractData.data && Object.keys(contractData.data).length > 0 ? (<ul>{Object.entries(contractData.data).map(([k, v]) => <li key={k}><strong>{k}:</strong> {String(v)}</li>)}</ul>) : <p>No standard data.</p>}{contractData.errors && <div><h4>Errors:</h4><ul>{Object.entries(contractData.errors).map(([k,v])=><li key={k} style={{color:'orange'}}><strong>{k}:</strong> {String(v)}</li>)}</ul></div>}</div>)}</div>
           <div className="card"><h2>Generic Function Calls</h2>{readOnlyFunctions.length > 0 ? (<div><label>Select Function: </label><select value={selectedFunctionIndex} onChange={handleFunctionSelect} style={{marginBottom: '10px'}}><option value="">-- Select --</option>{readOnlyFunctions.map((f, i) => <option key={f.id} value={f.id}>{f.name}({f.inputs.map(inp=>inp.type).join(', ')})</option>)}</select>{currentSelectedFunction && (<>{currentSelectedFunction.inputs.length > 0 && (<div><h4>Inputs for {currentSelectedFunction.name}:</h4>{currentSelectedFunction.inputs.map((input, idx) => (<div key={idx}><label>{input.name || \`param\${idx}\`} ({input.type}): </label><input type="text" value={functionInputs[input.name || \`param\${idx}\`] || ''} onChange={(e) => handleFunctionInputChange(input.name || \`param\${idx}\`, e.target.value)} style={{marginLeft: '5px', width: '50%'}} /></div>))}</div>)}<button onClick={handleCallGenericFunction} style={{marginTop: '10px'}}>Call {currentSelectedFunction.name}</button></>)}{genericCallStatus && <p style={{marginTop: '10px', whiteSpace: 'pre-wrap'}}>{genericCallStatus}</p>}{genericCallResult !== null && (<div><h4>Result:</h4><pre style={{backgroundColor: '#f0f0f0', padding: '10px', overflowX: 'auto'}}>{typeof genericCallResult === 'object' ? JSON.stringify(genericCallResult, null, 2) : String(genericCallResult)}</pre></div>)}</div>) : <p>No read-only functions in ABI.</p>}</div>


          <div className="card">
            <h2>Event Listening for {contractAddress.slice(0,10)}...</h2>
            {availableEvents.length > 0 ? (
              <div>
                <p>Select events to monitor:</p>
                <div style={{ textAlign: 'left', maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
                  {availableEvents.map(event => (
                    <div key={event.id || event.name}>
                      <input type="checkbox" id={`event-\${event.name}-\${event.id}`} checked={!!selectedEvents[event.name]} onChange={() => handleEventSelectionChange(event.name)} />
                      <label htmlFor={`event-\${event.name}-\${event.id}`} style={{ marginLeft: '5px', cursor: 'pointer', color: activeWsSubscriptions[event.name] ? 'green' : 'inherit', fontWeight: activeWsSubscriptions[event.name] ? 'bold' : 'normal' }}>
                        {event.name} ({event.inputs.map(i => \`\${i.name||'_'}: \${i.type}\`).join(', ')}) {activeWsSubscriptions[event.name] ? '(Listening)' : ''}
                      </label>
                    </div>
                  ))}
                </div>
                <button onClick={handleToggleListening} disabled={wsConnectionStatus !== 'Connected'}>
                  Update Subscriptions
                </button>
                {eventListeningStatus && <p style={{marginTop: '10px', color: eventListeningStatus.startsWith('Error') ? 'red' : 'green' }}>{eventListeningStatus}</p>}

                <div style={{marginTop: '10px'}}>
                    <h4>Live Events Log (Last {liveEventMessages.length} of 50):</h4>
                    <div style={{border: '1px solid #eee', minHeight: '150px', maxHeight: '300px', padding: '5px', backgroundColor: '#f9f9f9', overflowY: 'auto', fontSize:'0.85em'}}>
                        {liveEventMessages.length === 0 && <p><i>No events received yet.</i></p>}
                        {liveEventMessages.map((msg, index) => (
                          <div key={index} style={{borderBottom: '1px dashed #ccc', marginBottom:'5px', paddingBottom:'5px'}}>
                            <p><strong>{msg.eventName}</strong> <span style={{fontSize:'0.9em'}}>on {msg.contractAddress?.slice(0,10)}... (Block: {msg.blockNumber})</span></p>
                            <pre style={{whiteSpace:'pre-wrap', wordBreak:'break-all', backgroundColor:'#fff', padding:'3px', margin:'0'}}>
                              {JSON.stringify(msg.args, null, 2)}
                            </pre>
                            {msg.transactionHash && <p style={{fontSize:'0.9em', margin:'2px 0 0 0'}}>Tx: {msg.transactionHash.slice(0,16)}...</p>}
                          </div>
                        ))}
                    </div>
                </div>
              </div>
            ) : <p>No events found in ABI.</p>}
          </div>
        </>
      )}
       {!isAbiReady && contractAddress && ( /* If address is set but ABI not ready */
        <div className="card">
          <p>ABI not loaded or parsed for the current address. Please submit or load an ABI.</p>
        </div>
      )}
      { !contractAddress && ( /* If no contract address is set */
        <div className="card">
          <p>Please enter a contract address and ABI to begin.</p>
        </div>
      )}
    </>
  );
}
export default App;
EOF

echo "Frontend App.jsx updated for WebSocket connection, event subscription, and display."
