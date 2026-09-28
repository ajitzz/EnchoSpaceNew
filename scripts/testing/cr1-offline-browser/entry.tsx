import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../../../components/AuthContext';
import { ensureSafeOfflineWorker, purgeRetiredWorkboxQueue } from '../../../lib/legacyOfflineQueue';
import { actorQueueKey, clearActorScopedOfflineData, processOfflineQueue, queueMutationWithReceipt } from '../../../lib/syncService';
import { get, keys } from 'idb-keyval';

const audit = {
    state: 'STARTING',
    actorQueueKey, clearActorScopedOfflineData, processOfflineQueue, queueMutationWithReceipt,
    purgeRetiredWorkboxQueue, get, keys,
    login: (_id: number, _token: string) => {},
    logout: () => {},
};
Object.assign(window, { offlineAudit: audit });

function Account() {
    const auth = useAuth();
    React.useEffect(() => {
        audit.login = (id, token) => auth.login({ id, email: `actor${id}@example.invalid`, name: `Fixture ${id}`, role: 'host' }, token);
        audit.logout = auth.logout;
    }, [auth]);
    return <p data-testid="actor">{auth.user?.id ?? 'signed-out'}</p>;
}

void ensureSafeOfflineWorker().then(() => {
    audit.state = 'READY';
    createRoot(document.getElementById('root')!).render(<AuthProvider><Account /></AuthProvider>);
}).catch(() => {
    audit.state = 'UPGRADE_REQUIRED';
    document.getElementById('root')!.textContent = 'Secure update required';
});
