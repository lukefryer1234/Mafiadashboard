import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import axios from 'axios';
import './App.css';
import BasicChart from './components/BasicChart';
import { AuthContext } from './contexts/AuthContext';
import RegistrationPage from './components/RegistrationPage';
import LoginPage from './components/LoginPage';

const BACKEND_URL = 'http://localhost:3001';
const WEBSOCKET_URL = 'ws://localhost:3001';

// Helper to prepare chart data (full implementation from previous step)
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
  const [currentPage, setCurrentPage] = useState('login');

  // App-specific states (full list from previous step)
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
    setContractAddress(''); setContractName(''); setContractAbi('');
    setAbiSubmissionStatus(''); setIsAbiReady(false);
    setReadOnlyFunctions([]); setAvailableEvents([]);
    setSelectedFunctionIndex(''); setFunctionInputs({});
    setGenericCallResult(null); setGenericCallStatus('');
    setSelectedEvents({}); setEventListeningStatus('');
    setLiveEventMessages([]); setActiveWsSubscriptions({});
    setShowGenericResultAsChart(false); setEventFrequencies({});
    setContractData(null); setFetchDataStatus('');
    setStoredContracts([]); setListContractsError('');
  }, []);

  useEffect(() => {
    if (isAuthenticated) { if (currentPage !== 'dashboard') setCurrentPage('dashboard'); }
    else { resetAppSpecificStates(); if (currentPage === 'dashboard' || currentPage === '') setCurrentPage('login');}
  }, [isAuthenticated, currentPage, resetAppSpecificStates]); // Added currentPage back as per original logic, resetAppSpecificStates is stable

  const parseAndStoreAbiElements = useCallback((abiString) => {
    setEventFrequencies({});
    try {
      const parsedAbi = JSON.parse(abiString);
      if (!Array.isArray(parsedAbi)) { setAbiSubmissionStatus('Error: ABI not array.'); setIsAbiReady(false); return false; }
      const funcs = parsedAbi.map((item,i)=>({...item, id:i})).filter(item=>item.type==='function'&&(item.stateMutability==='view'||item.stateMutability==='pure')).map(f=>({id:f.id,name:f.name,inputs:f.inputs||[],outputs:f.outputs||[]}));
      const evs = parsedAbi.map((item,i)=>({...item, id:i})).filter(item=>item.type==='event').map(e=>({id:e.id,name:e.name,inputs:e.inputs||[],anonymous:e.anonymous||false}));
      setReadOnlyFunctions(funcs); setAvailableEvents(evs); setIsAbiReady(true);
      setAbiSubmissionStatus('ABI parsed. Functions & Events extracted.'); return true;
    } catch (e) { setAbiSubmissionStatus(\`ABI Parse Error: \${e.message}\`); setIsAbiReady(false); return false; }
  }, []);

  useEffect(() => {
    if (contractAbi && contractAddress) { parseAndStoreAbiElements(contractAbi); }
    else if (!contractAddress || !contractAbi) { setIsAbiReady(false); setReadOnlyFunctions([]); setAvailableEvents([]); setSelectedEvents({}); setEventFrequencies({});}
  }, [contractAbi, contractAddress, parseAndStoreAbiElements]);

  useEffect(() => { // WebSocket effect (full implementation from previous step)
    if (!contractAddress || !isAbiReady) { if (wsRef.current) wsRef.current.close(); return; }
    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        setWsConnectionStatus('Connecting...'); const socket = new WebSocket(WEBSOCKET_URL); wsRef.current = socket;
        socket.onopen = () => setWsConnectionStatus('Connected');
        socket.onmessage = (event) => {
            try { const message = JSON.parse(event.data); console.log('WS Received:', message.type);
                if (message.type === 'EVENT_DATA' && message.payload) { setLiveEventMessages(prev => [message.payload, ...prev.slice(0, 49)]); setEventFrequencies(prevFreq => ({ ...prevFreq, [message.payload.eventName]: (prevFreq[message.payload.eventName] || 0) + 1 })); }
                else if (message.type === 'SUBSCRIPTION_ACK') { setActiveWsSubscriptions(prev => ({ ...prev, [message.payload.eventName]: message.payload.status === 'subscribed' })); setEventListeningStatus(\`\${message.payload.status === 'subscribed'?'Subscribed to':'Error with'} \${message.payload.eventName}\`); }
                else if (message.type === 'UNSUBSCRIPTION_ACK') { setActiveWsSubscriptions(prev => ({ ...prev, [message.payload.eventName]: false })); setEventListeningStatus(\`Unsubscribed from \${message.payload.eventName}\`); }
                else if (message.type === 'SUBSCRIPTION_ERROR') setEventListeningStatus(\`Sub Error: \${message.payload.error}\`); else if (message.type === 'connection_ack') setEventListeningStatus(\`WebSocket: \${message.message}\`); else setEventListeningStatus(\`WS Msg: \${message.type}\`);
            } catch (e) { console.error("WS msg processing err:",e); setLiveEventMessages(prev => [{eventName:"Processing Error", args:{error:e.message, data:event.data.substring(0,100)}}, ...prev.slice(0,49)]);}
        };
        socket.onerror = (err) => { console.error("WS Error:", err); setWsConnectionStatus('Error'); };
        socket.onclose = (ev) => { console.log('WS Disconnected. Code:',ev.code); setWsConnectionStatus('Disconnected'); wsRef.current = null; setActiveWsSubscriptions({}); setEventFrequencies({}); };
    }
    return () => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(); wsRef.current = null; };
  }, [contractAddress, isAbiReady]);

  useEffect(() => { // Initial data fetch for latest block
    const fetchLatestBlock = async () => { try { const res = await axios.get(\`\${BACKEND_URL}/api/latest-block\`); setLatestBlock(res.data.latestBlockNumber); } catch (err) { console.error("Err fetching block:",err); setBlockError('Failed to fetch blockchain status.'); }};
    fetchLatestBlock();
  }, []);

  const fetchStoredContracts = useCallback(async () => {
    setListContractsError('');
    try { const res = await axios.get(\`\${BACKEND_URL}/api/contracts\`); setStoredContracts(res.data); }
    catch (err) { console.error("Err fetching stored contracts:", err.response?.data || err.message); setListContractsError(err.response?.data?.error || 'Failed to fetch stored contracts.'); }
  }, []);

  useEffect(() => { if (isAuthenticated && currentPage === 'dashboard') fetchStoredContracts(); }, [isAuthenticated, currentPage, fetchStoredContracts]);

  const handleAddressChange = (event) => { setContractAddress(event.target.value); resetAppSpecificStates(); };
  const handleNameChange = (event) => { setContractName(event.target.value); };
  const handleAbiChange = (event) => { setContractAbi(event.target.value); if (!event.target.value) resetAppSpecificStates(); };

  const handleSubmitAbi = async () => {
    if (!contractAddress.trim() || !contractAbi.trim()) { setAbiSubmissionStatus('Error: Address & ABI required.'); setIsAbiReady(false); return; }
    if (!parseAndStoreAbiElements(contractAbi)) return;
    setAbiSubmissionStatus('Submitting ABI to backend...');
    try {
      const res = await axios.post(\`\${BACKEND_URL}/api/contract/abi\`, { address: contractAddress, abi: contractAbi, name: contractName });
      setAbiSubmissionStatus(\`Backend: \${res.data.message}. Client: ABI parsed.\`); fetchStoredContracts();
    } catch (error) { setAbiSubmissionStatus(\`Backend Error: \${error.response?.data?.error || error.message}. Client: ABI parsed.\`); console.error("Err submitting ABI:", error); }
  };

  const handleFetchData = async () => {
    if (!contractAddress.trim() || !isAbiReady) { setFetchDataStatus('Error: Contract address and ready ABI are required.'); return; }
    setFetchDataStatus('Fetching standard data...'); setContractData(null);
    try {
      const res = await axios.get(\`\${BACKEND_URL}/api/contract/data/\${contractAddress}\`); setContractData(res.data);
      if (res.data.data && Object.keys(res.data.data).length > 0) setFetchDataStatus('Standard data fetched.');
      else if (res.data.errors && Object.keys(res.data.errors).length > 0) setFetchDataStatus('Attempted standard fetch, some calls failed.');
      else setFetchDataStatus('No standard data found or contract does not implement common functions.');
    } catch (error) { setContractData(null); if (error.response) setFetchDataStatus(\`Error fetching standard data: \${error.response.data.error || 'Failed.'}\`); else if (error.request) setFetchDataStatus('Error: No server response.'); else setFetchDataStatus(\`Error: \${error.message}\`); console.error("Error fetching standard data:", error); }
  };

  const handleSelectContract = useCallback(async (selectedAddress) => {
    resetAppSpecificStates(); setContractAddress(selectedAddress);
    setAbiSubmissionStatus(\`Loading ABI for \${selectedAddress}...\`);
    try {
        const res = await axios.get(\`\${BACKEND_URL}/api/contract/abi/\${selectedAddress}\`);
        if (res.data && res.data.abi) {
            const abiStr = typeof res.data.abi === 'string' ? res.data.abi : JSON.stringify(res.data.abi, null, 2);
            setContractName(res.data.name || ''); setContractAbi(abiStr);
        } else { setAbiSubmissionStatus(\`ABI not found for \${selectedAddress}.\`); setIsAbiReady(false); }
    } catch (error) { setAbiSubmissionStatus(\`Error loading ABI: \${error.response?.data?.error || error.message}\`); setIsAbiReady(false); console.error("Err loading stored ABI:", error); }
  }, [resetAppSpecificStates]); // parseAndStoreAbiElements removed, handled by useEffect [contractAbi]

  const handleFunctionSelect = (event) => {
    const funcId = event.target.value; setSelectedFunctionIndex(funcId);
    setFunctionInputs({}); setGenericCallResult(null); setShowGenericResultAsChart(false); setGenericCallStatus('');
    if (funcId !== '') { const selFunc = readOnlyFunctions.find(f => f.id.toString() === funcId); if (selFunc) setFunctionInputs(selFunc.inputs.reduce((acc,inp,i)=>({...acc, [inp.name||`param\${i}`]:''}),{})); }
  };
  const handleFunctionInputChange = (inputName, value) => { setFunctionInputs(prev => ({ ...prev, [inputName]: value })); };
  const handleEventSelectionChange = (eventName) => { setSelectedEvents(prev => ({...prev, [eventName]: !prev[eventName]})); };

  const handleCallGenericFunction = async () => {
    const selectedFuncObj = readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex);
    if (!selectedFuncObj) { setGenericCallStatus('Error: Function not selected.'); return; }
    const argsArray = selectedFuncObj.inputs.map((input, idx) => functionInputs[input.name || \`param\${idx}\`] || '');
    setGenericCallStatus(\`Calling \${selectedFuncObj.name}...\`); setGenericCallResult(null); setShowGenericResultAsChart(false);
    try {
      const response = await axios.post(\`\${BACKEND_URL}/api/contract/call/\${contractAddress}\`, { functionName: selectedFuncObj.name, args: argsArray });
      setGenericCallResult(response.data.result); setGenericCallStatus(\`Call to \${selectedFuncObj.name} successful.\`);
      const chartableData = prepareChartJsData(response.data.result, selectedFuncObj.name, 'Call Result');
      if(chartableData) setShowGenericResultAsChart(true);
    } catch (error) { setGenericCallResult(null); setGenericCallStatus(\`Error calling \${selectedFuncObj.name}: \${error.response?.data?.error || error.message} - \${error.response?.data?.details || ''}\`); console.error("Error calling generic function:", error); }
  };

  const handleToggleListening = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { setEventListeningStatus("WebSocket not connected."); return; }
    let currentStatusUpdates = [];
    availableEvents.forEach(event => {
      const eventName = event.name; const shouldBeSubscribed = !!selectedEvents[eventName]; const isActive = !!activeWsSubscriptions[eventName];
      if (shouldBeSubscribed && !isActive) { wsRef.current.send(JSON.stringify({ type: 'SUBSCRIBE', payload: { contractAddress, eventName } })); currentStatusUpdates.push(\`Subscribing to \${eventName}...\`); }
      else if (!shouldBeSubscribed && isActive) { wsRef.current.send(JSON.stringify({ type: 'UNSUBSCRIBE', payload: { contractAddress, eventName } })); currentStatusUpdates.push(\`Unsubscribing from \${eventName}...\`); }
    });
    if (currentStatusUpdates.length > 0) setEventListeningStatus(currentStatusUpdates.join(' '));
    else setEventListeningStatus("Subscription states match UI selections. No action sent.");
  };

  const genericCallChartData = prepareChartJsData(genericCallResult, readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex)?.name, 'Generic Call Result', { bg: 'rgba(75, 192, 192, 0.5)', border: 'rgba(75, 192, 192, 1)'});
  const eventFrequencyChartData = prepareChartJsData({ labels: Object.keys(eventFrequencies), datasets: [{ label: 'Received Event Count', data: Object.values(eventFrequencies), backgroundColor: 'rgba(153, 102, 255, 0.6)', borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 1, }] }, null, 'Event Frequency');

  const currentSelectedFunction = selectedFunctionIndex !== '' ? readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex) : null;
  const renderPage = () => {
    if (authIsLoading && !user) { return <div className="card"><p>Checking authentication...</p></div>; }
    if (!isAuthenticated) {
        if (currentPage === 'register') return <RegistrationPage onSwitchToLogin={() => setCurrentPage('login')} />;
        return <LoginPage onSwitchToRegister={() => setCurrentPage('register')} />;
    }
    return (
        <>
          <div className="card user-status"><p>Logged in as: <strong>{user.email}</strong> (ID: {user.id})</p><button onClick={() => logout()}>Logout</button></div>
          <div className="card"><p>WebSocket: <strong style={{color: wsConnectionStatus === 'Connected'?'green':(wsConnectionStatus.startsWith('Error')||wsConnectionStatus === 'Disconnected'?'red':'orange')}}>{wsConnectionStatus}</strong></p></div>
          <div className="card"><h2>Blockchain Status</h2>{blockError && <p style={{color:'red'}}>{blockError}</p>}{latestBlock ? <p>Latest Block: <strong>{latestBlock}</strong></p> : <p>Loading...</p>}</div>
          <div className="card"><h2>Your Stored Contracts</h2>{listContractsError && <p style={{color:'red'}}>{listContractsError}</p>}{storedContracts.length>0?<ul>{storedContracts.map(c=><li key={c.address}><strong>{c.name||'Unnamed'}</strong> ({c.address.slice(0,6)}...{c.address.slice(-4)}) <button onClick={()=>handleSelectContract(c.address)}>Load</button></li>)}</ul>:<p>No contracts.</p>}<button onClick={fetchStoredContracts} disabled={authIsLoading || !isAuthenticated}>Refresh</button></div>
          <div className="card"><h2>Monitor Contract</h2><div><label>Address: <input type="text" value={contractAddress} onChange={handleAddressChange} style={{width:"90%"}}/></label></div><div><label>Name: <input type="text" value={contractName} onChange={handleNameChange} style={{width:"90%"}}/></label></div><div><label>ABI (JSON): <textarea value={contractAbi} onChange={handleAbiChange} rows={2} style={{width:"95%"}}/></label></div><button onClick={handleSubmitAbi}>Save & Parse ABI</button>{abiSubmissionStatus && <p style={{color:abiSubmissionStatus.includes('Error:')?'red':'green'}}>{abiSubmissionStatus}</p>}</div>

          {isAbiReady && contractAddress && (
            <>
              <div className="card"><h2>Standard Contract Data</h2>
                <button onClick={handleFetchData} disabled={!contractAddress.trim() || !isAbiReady}>
                  Fetch (e.g., Name, Symbol)
                </button>
                {fetchDataStatus && <p style={{color: fetchDataStatus.startsWith('Error:') ? 'red' : (fetchDataStatus.includes('fetched') ? 'green' : 'black')}}>{fetchDataStatus}</p>}
                {contractData && (<div><h3>Data for {contractData.address.slice(0,10)}...</h3>{contractData.data&&Object.keys(contractData.data).length>0?<ul>{Object.entries(contractData.data).map(([k,v])=><li key={k}><strong>{k}:</strong> {String(v)}</li>)}</ul>:<p>No standard data.</p>}{contractData.errors&&<div><h4>Errors:</h4><ul>{Object.entries(contractData.errors).map(([k,v])=><li key={k} style={{color:'orange'}}><strong>{k}:</strong>{String(v)}</li>)}</ul></div>}</div>)}
              </div>

              <div className="card"><h2>Generic Function Calls</h2>
                {readOnlyFunctions.length > 0 ? (<div><label>Function: </label><select value={selectedFunctionIndex} onChange={handleFunctionSelect}><option value="">--Select--</option>{readOnlyFunctions.map(f=><option key={f.id} value={f.id}>{f.name}({f.inputs.map(i=>i.type).join(',')})</option>)}</select>
                {currentSelectedFunction && (<>{currentSelectedFunction.inputs.length > 0 && (<div><h4>Inputs for {currentSelectedFunction.name}:</h4>{currentSelectedFunction.inputs.map((inp, i)=>(<div key={i}><label>{inp.name||`param\${i}`} ({inp.type}): </label><input type="text" value={functionInputs[inp.name||`param\${i}`]||''} onChange={e=>handleFunctionInputChange(inp.name||`param\${i}`,e.target.value)} style={{width:'50%'}}/></div>))}</div>)}<button onClick={handleCallGenericFunction}>Call {currentSelectedFunction.name}</button></>)}
                {genericCallStatus && <p style={{color: genericCallStatus.startsWith('Error:') ? 'red' : 'green'}}>{genericCallStatus}</p>}
                {genericCallResult!==null && (<div><h4>Result: {genericCallChartData && (<button onClick={()=>setShowGenericResultAsChart(!showGenericResultAsChart)}>{showGenericResultAsChart?'JSON':'Chart'}</button>)}</h4>
                <div className="chart-container">{showGenericResultAsChart && genericCallChartData ? <BasicChart chartData={genericCallChartData} title={currentSelectedFunction?.name}/> : <pre className="json-result">{typeof genericCallResult==='object'?JSON.stringify(genericCallResult,null,2):String(genericCallResult)}</pre>}</div>
                </div>)}
                </div>) : <p>No read-only functions in ABI.</p>}
              </div>

              <div className="card"><h2>Event Listening for {contractAddress.slice(0,10)}...</h2>
                {availableEvents.length > 0 ? (<div><p>Select events to monitor:</p><div style={{maxHeight:'150px',overflowY:'auto',border:'1px solid #ccc',padding:'5px',marginBottom:'10px'}}>{availableEvents.map(ev=>(<div key={ev.id}><input type="checkbox" id={`ev-\${ev.id}`} checked={!!selectedEvents[ev.name]} onChange={()=>handleEventSelectionChange(ev.name)}/><label htmlFor={`ev-\${ev.id}`} style={{marginLeft:'5px',color:activeWsSubscriptions[ev.name]?'green':'inherit',fontWeight:activeWsSubscriptions[ev.name]?'bold':'normal'}}>{ev.name}({ev.inputs.map(i=>\`\${i.name||'_'}:\${i.type}\`).join(', ')}){activeWsSubscriptions[ev.name]?' (Listening)':''}</label></div>))}</div>
                <button onClick={handleToggleListening} disabled={wsConnectionStatus!=='Connected'}>Update Subscriptions</button>
                {eventListeningStatus && <p style={{color:eventListeningStatus.startsWith('Error')?'red':'green'}}>{eventListeningStatus}</p>}
                {eventFrequencyChartData && Object.keys(eventFrequencies).length > 0 && (<div style={{marginTop: '20px'}}><h4>Event Frequency</h4><div className="chart-container"><BasicChart chartData={eventFrequencyChartData} title="Event Frequency" /></div></div>)}
                <div><h4>Live Events (Last {liveEventMessages.length}):</h4><div style={{border:'1px solid #eee',minHeight:'100px',maxHeight:'200px',padding:'5px',overflowY:'auto',fontSize:'0.8em'}}>{liveEventMessages.length===0&&<p><i>No events.</i></p>}{liveEventMessages.map((msg,i)=>(<div key={i} style={{borderBottom:'1px dashed #ccc',paddingBottom:'3px',marginBottom:'3px'}}><p><strong>{msg.eventName}</strong>@{msg.blockNumber}<span style={{fontSize:'0.85em'}}> ({msg.contractAddress?.slice(0,6)}...)</span></p><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all',margin:'0',padding:'2px',backgroundColor:'#fbfbfb'}}>{JSON.stringify(msg.args,null,1)}</pre>{msg.transactionHash&&<p style={{fontSize:'0.9em',margin:'0'}}>Tx: {msg.transactionHash.slice(0,12)}...</p>}</div>))}</div></div>
                </div>) : <p>No events in ABI.</p>}
              </div>
            </>
          )}
          {(!isAbiReady || !contractAddress) && isAuthenticated && <div className="card"><p>Load or submit contract address & ABI.</p></div>}
        </>
    );
  };

  return (
    <div className="App">
      <h1>PulseChain Dashboard</h1>
      {renderPage()}
      <style jsx global>{`
        .App { font-family: sans-serif; padding: 10px; max-width: 1200px; margin: auto; }
        .card { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .card h2 { margin-top: 0; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px; }
        .chart-container { max-width: 550px; min-height: 250px; margin: 15px auto; padding: 10px; border: 1px solid #ddd; border-radius: 4px; position: relative; }
        .json-result { background-color: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
        button { margin-right: 5px; padding: 8px 12px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer; background-color: #f0f0f0; }
        button:hover { background-color: #e0e0e0; }
        button:disabled { cursor: not-allowed; opacity: 0.6; }
        input[type="text"], input[type="email"], input[type="password"], textarea, select { padding: 8px; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; width: calc(100% - 18px); }
        label { display: block; margin-bottom: 2px; font-weight: bold; }
        ul { padding-left: 20px; list-style-type: none; } /* Removed bullets for contract list for cleaner look */
        li { margin-bottom: 8px; }
        .auth-page { max-width: 400px; margin: 40px auto; padding: 25px; text-align: center; }
        .auth-page form div { margin-bottom: 18px; text-align: left; }
        .auth-page label { font-size: 0.95em; }
        .auth-page button[type='submit'] { width: 100%; background-color: #007bff; color: white; font-size: 16px; }
        .auth-page button[type='submit']:disabled { background-color: #aaa; }
        .auth-page .page-message { margin-top: 15px; padding: 10px; border-radius: 4px; } /* Color set inline based on message */
        .auth-page .error-message { margin-top: 15px; padding: 10px; background-color: #ffebee; color: #c62828; border: 1px solid #c62828; border-radius: 4px; }
        .auth-page .link-button { background: none; border: none; color: #007bff; text-decoration: underline; cursor: pointer; padding: 5px; font-size: 0.9em; }
        .user-status { background-color: #e7f3fe; border-color: #b3d7ff; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; }
        .user-status p { margin: 0; }
      `}</style>
    </div>
  );
}
export default App;
