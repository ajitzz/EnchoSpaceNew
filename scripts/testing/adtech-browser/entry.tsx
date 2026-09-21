import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../../../components/AuthContext';
import CampaignStudio from '../../../components/marketing/CampaignStudio';
import AdtechWorkspace from '../../../components/marketing/AdtechWorkspace';
localStorage.setItem('token','isolated-fixture-token');
localStorage.setItem('user',JSON.stringify({id:10,name:'Synthetic host',role:'host'}));
createRoot(document.getElementById('root')!).render(location.pathname==='/host'?<AuthProvider><CampaignStudio/></AuthProvider>:<AdtechWorkspace/>);
