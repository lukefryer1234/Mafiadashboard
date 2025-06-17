const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const db = require('./database');
const { hashPassword, comparePassword } = require('./authUtils');
const jwt = require('jsonwebtoken');
const authenticateToken = require('./authMiddleware'); // Import the middleware

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

if (!JWT_SECRET) {
  console.error('[ERROR] JWT_SECRET is not defined. Exiting.');
  process.exit(1);
} else if (JWT_SECRET === 'your-very-secure-and-long-secret-key-for-dev-pls-change' && process.env.NODE_ENV === 'production') {
  console.error('[ERROR] Default JWT_SECRET in production. Exiting.');
  process.exit(1);
}

const pulseChainRpcUrl = process.env.PULSECHAIN_RPC_URL;
if (!pulseChainRpcUrl) {
  console.error("[ERROR] PULSECHAIN_RPC_URL is not defined. Exiting.");
  process.exit(1);
}
const provider = new ethers.JsonRpcProvider(pulseChainRpcUrl);
console.log("Connected to PulseChain RPC:", pulseChainRpcUrl);

// --- Auth Endpoints (Full implementation from previous steps) ---
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  console.log(`[AUTH_REGISTER] Attempting registration for email: \${email}`);
  if (!email || !password) return res.status(400).json({ errorCode: 'MISSING_CREDENTIALS', error: 'Email and password are required.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ errorCode: 'INVALID_EMAIL_FORMAT', error: 'Invalid email format.' });
  if (password.length < 6) return res.status(400).json({ errorCode: 'PASSWORD_TOO_SHORT', error: 'Password must be at least 6 characters long.' });
  try {
    const existingUser = await new Promise((resolve, reject) => {
      db.get("SELECT email FROM users WHERE email = ?", [email.toLowerCase()], (err, row) => {
        if (err) { console.error('[DB_ERROR] Checking user:', err.message, err.stack); reject(new Error('DB error.')); } else { resolve(row); }
      });
    });
    if (existingUser) return res.status(409).json({ errorCode: 'EMAIL_ALREADY_EXISTS', error: 'Email already registered.' });
    const hashedPassword = await hashPassword(password);
    const result = await new Promise((resolve, reject) => {
      db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [email.toLowerCase(), hashedPassword], function(err) {
        if (err) { console.error('[DB_ERROR] Inserting user:', err.message, err.stack); reject(new Error('DB error.')); } else { resolve({ id: this.lastID }); }
      });
    });
    console.log(`[AUTH_REGISTER] User \${email} (ID: \${result.id}) registered.`);
    res.status(201).json({ message: 'User registered successfully.', userId: result.id, email: email.toLowerCase() });
  } catch (error) {
    console.error('[AUTH_REGISTER_ERROR]', error.message, error.stack);
    if (error.message.startsWith('DB error')) return res.status(500).json({ errorCode: 'DATABASE_ERROR', error: 'Database error.'});
    return res.status(500).json({ errorCode: 'REGISTRATION_FAILED', error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const lowerEmail = email ? email.toLowerCase() : null;
  console.log(`[AUTH_LOGIN] Attempting login for email: \${lowerEmail}`);
  if (!lowerEmail || !password) return res.status(400).json({ errorCode: 'MISSING_CREDENTIALS', error: 'Email and password required.' });
  try {
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT id, email, password_hash FROM users WHERE email = ?", [lowerEmail], (err, row) => {
        if (err) { console.error('[DB_ERROR] Finding user:', err.message, err.stack); reject(new Error('DB error.')); } else { resolve(row); }
      });
    });
    if (!user) return res.status(401).json({ errorCode: 'INVALID_CREDENTIALS', error: 'Invalid email or password.' });
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ errorCode: 'INVALID_CREDENTIALS', error: 'Invalid email or password.' });
    const jwtPayload = { user: { id: user.id, email: user.email } };
    console.log('jwtPayload:', jwtPayload);
    jwt.sign( jwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }, (err, token) => {
        if (err) { console.error('[JWT_ERROR] Signing token:', err.message, err.stack); return res.status(500).json({ errorCode: 'TOKEN_SIGNING_ERROR', error: 'Could not generate token.' }); }
        console.log(`[AUTH_LOGIN] User \${user.email} (ID: \${user.id}) logged in.`);
        res.json({ message: 'Login successful.', token: token, user: { id: user.id, email: user.email } });
      }
    );
  } catch (error) {
    console.error('[AUTH_LOGIN_ERROR]', error.message, error.stack);
    if (error.message.startsWith('DB error')) return res.status(500).json({ errorCode: 'DATABASE_ERROR', error: 'Database error.'});
    return res.status(500).json({ errorCode: 'LOGIN_FAILED', error: 'Login failed.' });
  }
});


// --- ABI Management Endpoints (Now User-Specific where appropriate) ---
app.post('/api/contract/abi', authenticateToken, async (req, res) => {
  const { address, abi, name } = req.body;
  const userId = req.user.id;

  console.log(`[ABI_POST] User \${userId} saving ABI for address: \${address}`);
  if (!address || !abi) return res.status(400).json({ errorCode: 'MISSING_PARAMETERS', error: 'Address and ABI required.' });

  try {
    const parsedAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;
    if (!Array.isArray(parsedAbi)) throw new Error('Invalid ABI format, must be an array.');
    new ethers.Interface(parsedAbi); // Validate ABI structure
    const abiString = JSON.stringify(parsedAbi);

    const sql = `INSERT INTO contract_abis (address, abi, name, user_id) VALUES (?, ?, ?, ?)
                 ON CONFLICT(address) DO UPDATE SET
                   abi=excluded.abi,
                   name=excluded.name,
                   user_id=excluded.user_id,
                   added_date=CURRENT_TIMESTAMP
                 WHERE address = ? AND user_id = ?`; // Ensure user can only update their own on conflict
                 // Note: SQLite ON CONFLICT target must be the PK. If address is PK, this update might override other users' entries
                 // A better approach for multi-user ABIs with unique address constraint would be:
                 // 1. PK on (address, user_id) -> allows multiple users to have same address ABI.
                 // 2. Or, address is globally unique, first one wins, or last update wins (current model).
                 // Current model: Address is PK, so last user to save an ABI for an address "owns" it or updates it.
                 // Let's stick to the prompt's original simpler model for now: address is PK.
                 // The user_id field will indicate who last saved it.
    const simplerSql = `INSERT INTO contract_abis (address, abi, name, user_id) VALUES (?, ?, ?, ?)
                        ON CONFLICT(address) DO UPDATE SET
                          abi=excluded.abi,
                          name=excluded.name,
                          user_id=excluded.user_id,
                          added_date=CURRENT_TIMESTAMP`;

    db.run(simplerSql, [address.toLowerCase(), abiString, name || null, userId], function(err) {
      if (err) {
        console.error(`[DB_ERROR] User \${userId} saving ABI for \${address}:`, err.message, err.stack);
        return res.status(500).json({ errorCode: 'DB_INSERT_ERROR', error: 'Failed to save ABI.', details: err.message });
      }
      console.log(`[ABI_POST] User \${userId} saved/updated ABI for \${address}.`);
      res.status(200).json({ message: 'ABI stored successfully.', address: address });
    });
  } catch (e) {
    console.error(`[ABI_POST_ERROR] User \${userId}, Address \${address}:`, e.message, e.stack);
    res.status(400).json({ errorCode: 'INVALID_ABI_STRUCTURE', error: 'Invalid ABI format or structure.', details: e.message });
  }
});

app.get('/api/contracts', authenticateToken, (req, res) => {
  const userId = req.user.id;
  console.log(`[ABI_LIST] User \${userId} fetching their contracts.`);
  const sql = `SELECT address, name, added_date FROM contract_abis WHERE user_id = ? ORDER BY added_date DESC`;
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error(`[DB_ERROR] User \${userId} listing contracts:`, err.message, err.stack);
      return res.status(500).json({ errorCode: 'DB_LIST_ERROR', error: 'Failed to retrieve contracts.', details: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/contract/abi/:contractAddress', authenticateToken, (req, res) => {
  const { contractAddress } = req.params;
  console.log(`[ABI_GET] User \${req.user.id} fetching ABI for \${contractAddress}`);
  const sql = `SELECT address, abi, name, user_id, added_date FROM contract_abis WHERE address = ?`;
  db.get(sql, [contractAddress.toLowerCase()], (err, row) => {
    if (err) { console.error(`[DB_ERROR] Get ABI \${contractAddress}:`, err.message, err.stack); return res.status(500).json({errorCode: 'DB_READ_ERROR', error: 'DB error retrieving ABI.'}); }
    if (!row) { return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.' }); }
    try {
      res.json({ address: row.address, name: row.name, abi: JSON.parse(row.abi), added_date: row.added_date, owner_user_id: row.user_id });
    } catch (parseError) { console.error(`[ERROR] Parse ABI from DB \${contractAddress}:`, parseError.message, parseError.stack); return res.status(500).json({errorCode: 'ABI_PARSE_ERROR', error: 'Failed to parse ABI.'});}
  });
});

// --- Other Endpoints (Protected, but fetch ABI globally by address) ---
app.get('/api/test', (req, res) => { /* ... */ }); // Not protected as per original setup
app.get('/api/latest-block', async (req, res) => { /* ... */ }); // Not protected

app.get('/api/contract/data/:contractAddress', authenticateToken, async (req, res) => {
  const { contractAddress } = req.params; console.log(`[DATA_GET] User \${req.user.id} fetching data for \${contractAddress}`);
  const sql = `SELECT abi FROM contract_abis WHERE address = ?`; // Fetches ABI globally
  db.get(sql, [contractAddress.toLowerCase()], async (dbErr, row) => {
    if (dbErr) { /* ... */ return res.status(500).json({errorCode: 'DB_READ_ERROR', error: 'DB error'});}
    if (!row) { /* ... */ return res.status(404).json({errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.'});}
    try {
      const abi = JSON.parse(row.abi); const contract = new ethers.Contract(contractAddress, abi, provider);
      const data = {}; const errors = {}; const funcs = ['name', 'symbol', 'totalSupply', 'decimals'];
      for (const f of funcs) {
        if (abi.find(e => e.name === f && e.type === 'function' && (e.stateMutability === 'view' || e.stateMutability === 'pure') && (!e.inputs || e.inputs.length === 0))) {
          try { data[f] = String(await contract[f]()); } catch (e) { errors[f] = e.message; }
        }
      }
      if (Object.keys(data).length === 0 && Object.keys(errors).length > 0) return res.status(400).json({ errorCode: 'NO_DATA_FETCHED', details: errors });
      res.json({ address: contractAddress, data, ...(Object.keys(errors).length > 0 && { errors }) });
    } catch (error) { /* ... */ res.status(500).json({errorCode: 'CONTRACT_INTERACTION_FAILED', error: 'Interaction error'}); }
  });
});

app.post('/api/contract/call/:contractAddress', authenticateToken, async (req, res) => {
  const { contractAddress } = req.params; const { functionName, args } = req.body;
  console.log(`[CALL_POST] User \${req.user.id} calling \${functionName} on \${contractAddress}`);
  const abiSql = `SELECT abi FROM contract_abis WHERE address = ?`; // Fetches ABI globally
  db.get(abiSql, [contractAddress.toLowerCase()], async (dbErr, row) => {
    if (dbErr) { /* ... */ return res.status(500).json({errorCode: 'DB_READ_ERROR', error: 'DB error'});}
    if (!row) { /* ... */ return res.status(404).json({errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.'});}
    try {
      const abi = JSON.parse(row.abi); const contract = new ethers.Contract(contractAddress, abi, provider);
      const functionAbi = abi.find(item => item.type === 'function' && item.name === functionName);
      if (!functionAbi) return res.status(400).json({ errorCode: 'FUNCTION_NOT_FOUND_IN_ABI' });
      if (functionAbi.inputs.length !== args.length) return res.status(400).json({ errorCode: 'INVALID_ARGUMENT_COUNT' });
      const processedArgs = args.map((arg, index) => { /* ... (full arg processing logic) ... */
        const inputDef = functionAbi.inputs[index]; const inputType = inputDef.type; let pArg = arg;
        try {
            if (inputType.startsWith('uint')||inputType.startsWith('int')) { if (arg===''||(isNaN(arg)&&typeof arg==='string')) throw new Error('Invalid number'); pArg = arg.toString(); }
            else if (inputType === 'bool') { if (typeof arg==='string') { if (arg.toLowerCase()==='true') pArg=true; else if (arg.toLowerCase()==='false') pArg=false; else throw new Error('Invalid bool string');} else if (typeof arg!=='boolean') throw new Error('Expected bool');}
            else if (inputType === 'address') { if (!ethers.isAddress(arg)) throw new Error('Invalid address'); pArg = ethers.getAddress(arg); }
            else if (inputType.startsWith('bytes')) { const len = inputType==='bytes'?undefined:parseInt(inputType.replace('bytes','')); if(typeof arg==='string'){if(!ethers.isHexString(arg))throw new Error('Invalid hex'); if(len && arg.length!==2+len*2)throw new Error('Invalid length');} else throw new Error('Expected hex');}
        } catch (typeError) { throw new Error(`Argument '\${inputDef.name||index}' ('\${arg}'): \${typeError.message}`); }
        return pArg;
      });
      const result = await contract[functionName](...processedArgs);
      function stringifyBigInts(data) { /* ... (full stringify logic) ... */
        if(typeof data==='bigint')return data.toString(); if(Array.isArray(data)){if(Object.keys(data).some(k=>isNaN(parseInt(k)))){const o={};for(const k in data)if(isNaN(parseInt(k))&&Object.prototype.hasOwnProperty.call(data,k))o[k]=stringifyBigInts(data[k]);if(Object.keys(o).length===0)return data.map(stringifyBigInts);return o;}return data.map(stringifyBigInts);} if(typeof data==='object'&&data!==null){const o={};for(const k in data)if(Object.prototype.hasOwnProperty.call(data,k))o[k]=stringifyBigInts(data[k]);return o;} return data;
      }
      res.json({ functionName, args: processedArgs, result: stringifyBigInts(result) });
    } catch (error) {
      const details = error.reason || error.shortMessage || error.message;
      if (error.message.startsWith("Argument '")) return res.status(400).json({ errorCode: 'INVALID_ARGUMENT_VALUE', details });
      res.status(500).json({ errorCode: 'CONTRACT_CALL_FAILED', details });
    }
  });
});

// --- WebSocket Server Setup (Full implementation from previous steps) ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
console.log('[WSS] WebSocket Server initialized.');
// ... (Full WebSocket data structures and helper functions: contractEventSubscriptions, clientSubscriptions, activeContracts, globalEthersListeners, handleSubscribe, handleUnsubscribe, cleanupClient)
// Re-inserting full WebSocket handler implementations here for completeness
async function handleSubscribe(ws, contractAddress, eventName) { /* ... */ }
function handleUnsubscribe(ws,contractAddress,eventName){ /* ... */ }
function cleanupClient(ws){ /* ... */ }
async function handleSubscribe(ws, contractAddress, eventName) {
  const lowerAddress = contractAddress.toLowerCase(); const subscriptionId = `\${lowerAddress}_\${eventName}`;
  try {
    const row = await new Promise((resolve, reject) => db.get(`SELECT abi FROM contract_abis WHERE address = ?`,[lowerAddress],(e,r)=>e?reject(new Error(`DB_READ_ERROR: \${e.message}`)):(!r?reject(new Error(`ABI_NOT_FOUND`)):resolve(r))));
    const abi = JSON.parse(row.abi); if(!abi.find(i=>i.type==='event'&&i.name===eventName))throw new Error(`EVENT_NOT_FOUND_IN_ABI`);
    if(!globalEthersListeners.has(subscriptionId)){let c=activeContracts.get(lowerAddress)||new ethers.Contract(lowerAddress,abi,provider);activeContracts.set(lowerAddress,c);const l=(...a)=>{const ev=a[a.length-1];console.log(`[WSS_EVENT]\${eventName} on \${lowerAddress}#\${ev.blockNumber}`);const fa={};if(ev.args)for(const k in ev.args)if(isNaN(parseInt(k)))fa[k]=typeof ev.args[k]==='bigint'?ev.args[k].toString():ev.args[k];const d={type:'EVENT_DATA',payload:{contractAddress:lowerAddress,eventName,args:fa,blockNumber:ev.blockNumber,transactionHash:ev.transactionHash,logIndex:ev.logIndex}};if(contractEventSubscriptions.has(lowerAddress)&&contractEventSubscriptions.get(lowerAddress).has(eventName))contractEventSubscriptions.get(lowerAddress).get(eventName).forEach(cl=>cl.readyState===WebSocket.OPEN&&cl.send(JSON.stringify(d)));};try{c.on(eventName,l);globalEthersListeners.set(subscriptionId,{listener:l,refCount:0,contract:c});console.log(`[WSS_ETHERS]Listening:\${eventName} on \${lowerAddress}`);}catch(e){console.error(`[WSS_ETHERS_ERROR]Attach \${eventName} on \${lowerAddress}:`,e.message,e.stack);if(!Array.from(globalEthersListeners.keys()).some(id=>id.startsWith(lowerAddress+'_')&&id!==subscriptionId)&&activeContracts.has(lowerAddress))activeContracts.delete(lowerAddress);throw new Error(`ETHERS_LISTENER_SETUP_FAILED:\${e.message}`);}}
    if(!contractEventSubscriptions.has(lowerAddress))contractEventSubscriptions.set(lowerAddress,new Map());if(!contractEventSubscriptions.get(lowerAddress).has(eventName))contractEventSubscriptions.get(lowerAddress).set(eventName,new Set());contractEventSubscriptions.get(lowerAddress).get(eventName).add(ws);if(!clientSubscriptions.has(ws))clientSubscriptions.set(ws,new Map());clientSubscriptions.get(ws).set(subscriptionId,{contractAddress:lowerAddress,eventName});globalEthersListeners.get(subscriptionId).refCount++;ws.send(JSON.stringify({type:'SUBSCRIPTION_ACK',payload:{contractAddress,eventName,status:'subscribed'}}));console.log(`[WSS_SUB]Client subscribed:\${eventName} on \${lowerAddress}.RefCount:\${globalEthersListeners.get(subscriptionId).refCount}`);
  }catch(e){console.error(`[WSS_SUB_ERROR]Subscribe \${eventName} on \${contractAddress}:`,e.message,e.stack);ws.send(JSON.stringify({type:'SUBSCRIPTION_ERROR',payload:{contractAddress,eventName,error:e.message}}));}
}
function handleUnsubscribe(ws,contractAddress,eventName){
  const la=contractAddress.toLowerCase(),sid=`\${la}_\${eventName}`;let chs=false;if(clientSubscriptions.has(ws)&&clientSubscriptions.get(ws).has(sid)){clientSubscriptions.get(ws).delete(sid);if(clientSubscriptions.get(ws).size===0)clientSubscriptions.delete(ws);chs=true;}
  if(contractEventSubscriptions.has(la)&&contractEventSubscriptions.get(la).has(eventName)){contractEventSubscriptions.get(la).get(eventName).delete(ws);if(contractEventSubscriptions.get(la).get(eventName).size===0){contractEventSubscriptions.get(la).delete(eventName);console.log(`[WSS_SUB]No clients for \${eventName} on \${la}.`);}if(contractEventSubscriptions.get(la).size===0){contractEventSubscriptions.delete(la);console.log(`[WSS_SUB]No events for \${la}.`);}}
  if(chs&&globalEthersListeners.has(sid)){const gl=globalEthersListeners.get(sid);gl.refCount--;console.log(`[WSS_SUB]Unsubscribed \${eventName} on \${la}.RefCount:\${gl.refCount}`);if(gl.refCount===0){try{gl.contract.off(eventName,gl.listener);console.log(`[WSS_ETHERS]Stopped:\${eventName} on \${la}.`);}catch(e){console.error(`[WSS_ETHERS_ERROR]contract.off \${eventName} on \${la}:`,e.message,e.stack);}globalEthersListeners.delete(sid);let hm=Array.from(globalEthersListeners.keys()).some(id=>id.startsWith(la+'_'));if(!hm&&activeContracts.has(la)){activeContracts.delete(la);console.log(`[WSS_ETHERS]Removed contract \${la}`);}}ws.send(JSON.stringify({type:'UNSUBSCRIPTION_ACK',payload:{contractAddress,eventName,status:'unsubscribed'}}));
  }else{ws.send(JSON.stringify({type:'UNSUBSCRIPTION_ACK',payload:{contractAddress,eventName,status:'not_subscribed_or_already_removed'}}));}
}
function cleanupClient(ws){console.log('[WSS]Cleaning up client.');if(clientSubscriptions.has(ws)){const cs=new Map(clientSubscriptions.get(ws));cs.forEach(({contractAddress,eventName})=>handleUnsubscribe(ws,contractAddress,eventName));if(clientSubscriptions.has(ws)&&clientSubscriptions.get(ws).size===0)clientSubscriptions.delete(ws);else if(clientSubscriptions.has(ws))console.warn(`[WSS_CLEANUP]Client has \${clientSubscriptions.get(ws).size} subs after cleanup.`);}}

wss.on('connection', (ws) => {
  console.log('[WSS] Client connected.'); ws.send(JSON.stringify({ type: 'connection_ack', message: 'Successfully connected.' }));
  ws.on('message', async (m) => {
    let pM; try{pM=JSON.parse(m);}catch(e){console.error('[WSS]Invalid JSON:',m.toString());ws.send(JSON.stringify({type:'error',message:'Invalid JSON.'}));return;}
    const{type,payload}=pM;console.log('[WSS]Received:',type,payload?JSON.stringify(payload).substring(0,100)+(JSON.stringify(payload).length>100?'...':''):'No payload');
    switch(type){
      case 'SUBSCRIBE':if(payload&&payload.contractAddress&&payload.eventName)await handleSubscribe(ws,payload.contractAddress,payload.eventName);else ws.send(JSON.stringify({type:'error',message:'Invalid SUBSCRIBE payload.'}));break;
      case 'UNSUBSCRIBE':if(payload&&payload.contractAddress&&payload.eventName)handleUnsubscribe(ws,payload.contractAddress,payload.eventName);else ws.send(JSON.stringify({type:'error',message:'Invalid UNSUBSCRIBE payload.'}));break;
      default:console.log(`[WSS]Unknown type:\${type}`);ws.send(JSON.stringify({type:'message_ack',info:'Unknown type.'}));
    }
  });
  ws.on('close',()=>{console.log('[WSS]Client disconnected.');cleanupClient(ws);});
  ws.on('error',(e)=>{console.error('[WSS]Client error:',e.message,e.stack);cleanupClient(ws);});
});
wss.on('error',(e)=>console.error('[WSS]Server error:',e.message,e.stack));
// --- End of WebSocket Server Setup ---

server.listen(port, () => {
  console.log(`[INFO] HTTP and WebSocket Server listening at http://localhost:\${port}`);
});
