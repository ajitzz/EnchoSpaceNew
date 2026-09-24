import React from 'react';
import {createRoot} from 'react-dom/client';
import {HelmetProvider} from 'react-helmet-async';
import InboxPage from '../../../components/InboxPage';
localStorage.setItem('token','fixture-session');localStorage.setItem('user',JSON.stringify({id:10}));
createRoot(document.getElementById('root')!).render(<HelmetProvider><InboxPage role="guest" onBack={()=>{}}/></HelmetProvider>);
