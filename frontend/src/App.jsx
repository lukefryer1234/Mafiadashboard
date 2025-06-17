import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import axios from 'axios';
import './App.css';
// BasicChart is used by ConfigurableChartWidget, so it's indirectly used.
// import BasicChart from './components/BasicChart';
import { AuthContext } from './contexts/AuthContext';
import RegistrationPage from './components/RegistrationPage';
import LoginPage from './components/LoginPage';
import ConfigurableChartWidget from './components/ConfigurableChartWidget';
import MessageSigningWidget from './components/MessageSigningWidget';
import GameAssetWidget from './components/GameAssetWidget'; // Import the new widget
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const BACKEND_URL = 'http://localhost:3001';
const WEBSOCKET_URL = 'ws://localhost:3001';

// Helper to prepare chart data (full implementation from previous step)
const prepareChartJsData = (inputData, label, defaultTitle, customColor) => {
  if (Array.isArray(inputData) && inputData.every(item => typeof item === 'number' || (typeof item === 'string' && !isNaN(parseFloat(item))))) {
    const numericData = inputData.map(item => typeof item === 'string' ? parseFloat(item) : item).filter(item => !isNaN(item));
    if (numericData.length === 0) return null;
    return {
      labels: numericData.map((_, index) => 'Point ' + (index + 1)),
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

  // State for widget instances
  const [widgetInstances, setWidgetInstances] = useState([]);
  const [widgetLayoutError, setWidgetLayoutError] = useState('');


  // App-specific states (full list from previous step) - some might be deprecated by widgets
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

  // Default configurations for new widgets
  const DEFAULT_CHART_WIDGET_CONFIG = {
    chartTitle: 'New Chart Widget',
    chartType: 'bar',
    datasets: [{
      id: Date.now().toString() + "_ds", // ensure dataset ID is also unique
      name: 'Default Dataset',
      contractAddress: '',
      functionName: '',
      args: '',
      dataPath: 'result.value',
    }],
  };
  const DEFAULT_SIGN_MESSAGE_WIDGET_CONFIG = {}; // Currently no config used by MessageSigningWidget

  const DEFAULT_GAME_ASSET_WIDGET_CONFIG = {
    contractAddress: '',
    tokenId: '',
    assetName: 'My Game Asset',
  };


  const resetAppSpecificStates = useCallback(() => {
    // This function resets contract-specific monitoring tools.
    // It should NOT reset widgetInstances as they are part of the dashboard layout.
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
    } catch (e) { setAbiSubmissionStatus('ABI Parse Error: ' + e.message); setIsAbiReady(false); return false; }
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
                else if (message.type === 'SUBSCRIPTION_ACK') { setActiveWsSubscriptions(prev => ({ ...prev, [message.payload.eventName]: message.payload.status === 'subscribed' })); setEventListeningStatus((message.payload.status === 'subscribed'?'Subscribed to':'Error with') + ' ' + message.payload.eventName); }
                else if (message.type === 'UNSUBSCRIPTION_ACK') { setActiveWsSubscriptions(prev => ({ ...prev, [message.payload.eventName]: false })); setEventListeningStatus('Unsubscribed from ' + message.payload.eventName); }
                else if (message.type === 'SUBSCRIPTION_ERROR') setEventListeningStatus('Sub Error: ' + message.payload.error); else if (message.type === 'connection_ack') setEventListeningStatus('WebSocket: ' + message.message); else setEventListeningStatus('WS Msg: ' + message.type);
            } catch (e) { console.error("WS msg processing err:",e); setLiveEventMessages(prev => [{eventName:"Processing Error", args:{error:e.message, data:event.data.substring(0,100)}}, ...prev.slice(0,49)]);}
        };
        socket.onerror = (err) => { console.error("WS Error:", err); setWsConnectionStatus('Error'); };
        socket.onclose = (ev) => { console.log('WS Disconnected. Code:',ev.code); setWsConnectionStatus('Disconnected'); wsRef.current = null; setActiveWsSubscriptions({}); setEventFrequencies({}); };
    }
    return () => { if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(); wsRef.current = null; };
  }, [contractAddress, isAbiReady]);

  useEffect(() => { // Initial data fetch for latest block
    const fetchLatestBlock = async () => { try { const res = await axios.get(BACKEND_URL + '/api/latest-block'); setLatestBlock(res.data.latestBlockNumber); } catch (err) { console.error("Err fetching block:",err); setBlockError('Failed to fetch blockchain status.'); }};
    if (isAuthenticated) fetchLatestBlock();
  }, [isAuthenticated]);

  const fetchStoredContracts = useCallback(async () => {
    if (!isAuthenticated) return;
    setListContractsError('');
    try { const res = await axios.get(BACKEND_URL + '/api/contracts'); setStoredContracts(res.data); }
    catch (err) { console.error("Err fetching stored contracts:", err.response?.data || err.message); setListContractsError(err.response?.data?.error || 'Failed to fetch stored contracts.'); }
  }, [isAuthenticated]);

  useEffect(() => { if (isAuthenticated && currentPage === 'dashboard') fetchStoredContracts(); }, [isAuthenticated, currentPage, fetchStoredContracts]);

  // --- Widget Management Persistence ---
  const loadWidgetLayout = useCallback(async () => {
    if (!isAuthenticated) return;
    setWidgetLayoutError('');
    try {
      const res = await axios.get(`${BACKEND_URL}/api/me/widget-layout`);
      if (res.data && Array.isArray(res.data.layout)) {
        setWidgetInstances(res.data.layout);
      } else {
        // Initialize with a default chart widget if no layout is found or layout is not an array
        console.log("No valid widget layout found from backend, initializing with default.");
        setWidgetInstances([{
            id: `chart-${Date.now().toString()}`,
            type: 'chart',
            config: { ...DEFAULT_CHART_WIDGET_CONFIG, datasets: [{...DEFAULT_CHART_WIDGET_CONFIG.datasets[0], id: Date.now().toString() + "_ds_init" }] },
        }]);
      }
    } catch (err) {
      console.error("Error loading widget layout:", err);
      setWidgetLayoutError(err.response?.data?.error || 'Failed to load widget layout. Displaying default.');
      // Fallback to a default widget setup on error
      setWidgetInstances([{
        id: `chart-fallback-${Date.now().toString()}`,
        type: 'chart',
        config: { ...DEFAULT_CHART_WIDGET_CONFIG, datasets: [{...DEFAULT_CHART_WIDGET_CONFIG.datasets[0], id: Date.now().toString() + "_ds_fallback"}] },
      }]);
    }
  }, [isAuthenticated]); // DEFAULT_CHART_WIDGET_CONFIG removed as it's stable

  const saveWidgetLayoutToBackend = useCallback(async (layoutToSave) => {
    if (!isAuthenticated) return;
    setWidgetLayoutError('');
    try {
      await axios.post(`${BACKEND_URL}/api/me/widget-layout`, { layout: layoutToSave });
    } catch (err) {
      console.error("Error saving widget layout:", err);
      setWidgetLayoutError(err.response?.data?.error || 'Failed to save widget layout.');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && currentPage === 'dashboard') {
      loadWidgetLayout();
    }
  }, [isAuthenticated, currentPage, loadWidgetLayout]);

  const handleAddWidget = (widgetType) => {
    const newWidget = {
      id: `${widgetType}-${Date.now().toString()}`,
      type: widgetType,
      config: {}, // Initialize empty, then assign based on type
    };

    if (widgetType === 'chart') {
      newWidget.config = JSON.parse(JSON.stringify(DEFAULT_CHART_WIDGET_CONFIG));
      if (newWidget.config.datasets) {
          newWidget.config.datasets = newWidget.config.datasets.map(ds => ({...ds, id: Date.now().toString() + Math.random().toString(16).slice(2)}));
      }
    } else if (widgetType === 'signMessage') {
      newWidget.config = JSON.parse(JSON.stringify(DEFAULT_SIGN_MESSAGE_WIDGET_CONFIG));
    } else if (widgetType === 'gameAsset') {
      newWidget.config = JSON.parse(JSON.stringify(DEFAULT_GAME_ASSET_WIDGET_CONFIG));
    }

    const updatedInstances = [...widgetInstances, newWidget];
    setWidgetInstances(updatedInstances);
    saveWidgetLayoutToBackend(updatedInstances);
  };

  const handleRemoveWidget = (widgetIdToRemove) => {
    const updatedInstances = widgetInstances.filter(w => w.id !== widgetIdToRemove);
    setWidgetInstances(updatedInstances);
    saveWidgetLayoutToBackend(updatedInstances);
  };

  const handleWidgetConfigChange = (widgetId, newConfig) => {
    const updatedInstances = widgetInstances.map(w =>
      w.id === widgetId ? { ...w, config: newConfig } : w
    );
    setWidgetInstances(updatedInstances);
    saveWidgetLayoutToBackend(updatedInstances);
  };

  const onDragEnd = (result) => {
    const { destination, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const reorderedInstances = Array.from(widgetInstances);
    const [removed] = reorderedInstances.splice(source.index, 1);
    reorderedInstances.splice(destination.index, 0, removed);

    setWidgetInstances(reorderedInstances);
    saveWidgetLayoutToBackend(reorderedInstances);
  };
  // --- End Widget Management ---

  const handleAddressChange = (event) => { setContractAddress(event.target.value); resetAppSpecificStates(); };
  const handleNameChange = (event) => { setContractName(event.target.value); };
  const handleAbiChange = (event) => { setContractAbi(event.target.value); if (!event.target.value) resetAppSpecificStates(); };

  const handleSubmitAbi = async () => {
    if (!contractAddress.trim() || !contractAbi.trim()) { setAbiSubmissionStatus('Error: Address & ABI required.'); setIsAbiReady(false); return; }
    if (!parseAndStoreAbiElements(contractAbi)) return;
    setAbiSubmissionStatus('Submitting ABI to backend...');
    try {
      const res = await axios.post(BACKEND_URL + '/api/contract/abi', { address: contractAddress, abi: contractAbi, name: contractName });
      setAbiSubmissionStatus('Backend: ' + res.data.message + '. Client: ABI parsed.'); fetchStoredContracts();
    } catch (error) { setAbiSubmissionStatus('Backend Error: ' + (error.response?.data?.error || error.message) + '. Client: ABI parsed.'); console.error("Err submitting ABI:", error); }
  };

  const handleFetchData = async () => {
    if (!contractAddress.trim() || !isAbiReady) { setFetchDataStatus('Error: Contract address and ready ABI are required.'); return; }
    setFetchDataStatus('Fetching standard data...'); setContractData(null);
    try {
      const res = await axios.get(BACKEND_URL + '/api/contract/data/' + contractAddress); setContractData(res.data);
      if (res.data.data && Object.keys(res.data.data).length > 0) setFetchDataStatus('Standard data fetched.');
      else if (res.data.errors && Object.keys(res.data.errors).length > 0) setFetchDataStatus('Attempted standard fetch, some calls failed.');
      else setFetchDataStatus('No standard data found or contract does not implement common functions.');
    } catch (error) { setContractData(null); if (error.response) setFetchDataStatus('Error fetching standard data: ' + (error.response.data.error || 'Failed.')); else if (error.request) setFetchDataStatus('Error: No server response.'); else setFetchDataStatus('Error: ' + error.message); console.error("Error fetching standard data:", error); }
  };

  const handleSelectContract = useCallback(async (selectedAddress) => {
    resetAppSpecificStates(); setContractAddress(selectedAddress);
    setAbiSubmissionStatus('Loading ABI for ' + selectedAddress + '...');
    try {
        const res = await axios.get(BACKEND_URL + '/api/contract/abi/' + selectedAddress);
        if (res.data && res.data.abi) {
            const abiStr = typeof res.data.abi === 'string' ? res.data.abi : JSON.stringify(res.data.abi, null, 2);
            setContractName(res.data.name || ''); setContractAbi(abiStr);
        } else { setAbiSubmissionStatus('ABI not found for ' + selectedAddress); setIsAbiReady(false); }
    } catch (error) { setAbiSubmissionStatus('Error loading ABI: ' + (error.response?.data?.error || error.message)); setIsAbiReady(false); console.error("Err loading stored ABI:", error); }
  }, [resetAppSpecificStates]); // parseAndStoreAbiElements removed, handled by useEffect [contractAbi]

  const handleFunctionSelect = (event) => {
    const funcId = event.target.value; setSelectedFunctionIndex(funcId);
    setFunctionInputs({}); setGenericCallResult(null); setShowGenericResultAsChart(false); setGenericCallStatus('');
    if (funcId !== '') { const selFunc = readOnlyFunctions.find(f => f.id.toString() === funcId); if (selFunc) setFunctionInputs(selFunc.inputs.reduce((acc,inp,i)=>({...acc, [inp.name||'param'+i]:''}),{})); }
  };
  const handleFunctionInputChange = (inputName, value) => { setFunctionInputs(prev => ({ ...prev, [inputName]: value })); };
  const handleEventSelectionChange = (eventName) => { setSelectedEvents(prev => ({...prev, [eventName]: !prev[eventName]})); };

  const handleCallGenericFunction = async () => {
    const selectedFuncObj = readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex);
    if (!selectedFuncObj) { setGenericCallStatus('Error: Function not selected.'); return; }
    const argsArray = selectedFuncObj.inputs.map((input, idx) => functionInputs[input.name || 'param'+idx] || '');
    setGenericCallStatus('Calling ' + selectedFuncObj.name + '...'); setGenericCallResult(null); setShowGenericResultAsChart(false);
    try {
      const response = await axios.post(BACKEND_URL + '/api/contract/call/' + contractAddress, { functionName: selectedFuncObj.name, args: argsArray });
      setGenericCallResult(response.data.result); setGenericCallStatus('Call to ' + selectedFuncObj.name + ' successful.');
      const chartableData = prepareChartJsData(response.data.result, selectedFuncObj.name, 'Call Result');
      if(chartableData) setShowGenericResultAsChart(true);
    } catch (error) { setGenericCallResult(null); setGenericCallStatus('Error calling ' + selectedFuncObj.name + ': ' + (error.response?.data?.error || error.message) + ' - ' + (error.response?.data?.details || '')); console.error("Error calling generic function:", error); }
  };

  const handleToggleListening = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { setEventListeningStatus("WebSocket not connected."); return; }
    let currentStatusUpdates = [];
    availableEvents.forEach(event => {
      const eventName = event.name; const shouldBeSubscribed = !!selectedEvents[eventName]; const isActive = !!activeWsSubscriptions[eventName];
      if (shouldBeSubscribed && !isActive) { wsRef.current.send(JSON.stringify({ type: 'SUBSCRIBE', payload: { contractAddress, eventName } })); currentStatusUpdates.push('Subscribing to ' + eventName + '...'); }
      else if (!shouldBeSubscribed && isActive) { wsRef.current.send(JSON.stringify({ type: 'UNSUBSCRIBE', payload: { contractAddress, eventName } })); currentStatusUpdates.push('Unsubscribing from ' + eventName + '...'); }
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
    // Main content for authenticated users (Dashboard View)
    return (
      <div className="dashboard-view">
        <div className="card user-status">
          <p>Logged in as: <strong>{user.email}</strong> (ID: {user.id})</p>
          <button onClick={() => logout()}>Logout</button>
        </div>

        <div className="add-widget-controls card">
          <h3>Add New Widget</h3>
          <button onClick={() => handleAddWidget('chart')}>Add Chart Widget</button>
          <button onClick={() => handleAddWidget('signMessage')}>Add Sign Message Widget</button>
          <button onClick={() => handleAddWidget('gameAsset')}>Add Game Asset Widget</button> {/* New button */}
          {widgetLayoutError && <p className="widget-error" style={{marginTop: '10px'}}>{widgetLayoutError}</p>}
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboardWidgets">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="widgets-container" // Ensure this class is styled for layout
              >
                {widgetInstances.map((widget, index) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index}>
                    {(providedDraggable) => (
                      <div
                        ref={providedDraggable.innerRef}
                        {...providedDraggable.draggableProps}
                        {...providedDraggable.dragHandleProps}
                        className="widget-draggable-wrapper" // For styling individual draggable items
                      >
                        {widget.type === 'chart' && (
                          <ConfigurableChartWidget
                            widgetId={widget.id}
                            initialConfig={widget.config}
                            onConfigChange={(newConfig) => handleWidgetConfigChange(widget.id, newConfig)}
                            onRemove={() => handleRemoveWidget(widget.id)}
                          />
                        )}
                        {widget.type === 'signMessage' && (
                          <MessageSigningWidget
                            widgetId={widget.id}
                            onRemove={() => handleRemoveWidget(widget.id)}
                          />
                        )}
                        {widget.type === 'gameAsset' && ( // Render GameAssetWidget
                          <GameAssetWidget
                            widgetId={widget.id}
                            initialConfig={widget.config}
                            onConfigChange={(newConfig) => handleWidgetConfigChange(widget.id, newConfig)}
                            onRemove={() => handleRemoveWidget(widget.id)}
                          />
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Optional: Keep legacy tools in a separate, non-widgetized section if needed */}
        <div className="legacy-tools-section card" style={{marginTop: '30px', borderTop: '2px solid #007bff', display: 'none'}}> {/* Hidden for now */}
            <h2>Legacy Contract Monitoring Tools</h2>
            {/* ... (all the old contract monitoring UI) ... */}
        </div>

      </div>
    );
  };

  const renderContent = () => {
    if (authIsLoading && !user) { return <div className="card"><p>Checking authentication...</p></div>; }
    if (!isAuthenticated) {
        if (currentPage === 'register') return <RegistrationPage onSwitchToLogin={() => setCurrentPage('login')} />;
        return <LoginPage onSwitchToRegister={() => setCurrentPage('register')} />;
    }
    return renderPage();
  }

  return (
    <div className="App">
      <h1>PulseChain Dashboard</h1>
      {renderContent()}
    </div>
  );
}
export default App;
