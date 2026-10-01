import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth, type User } from '../../../components/AuthContext';
import { ensureSafeOfflineWorker, purgeRetiredWorkboxQueue } from '../../../lib/legacyOfflineQueue';
import { actorQueueKey, clearActorScopedOfflineData, processOfflineQueue, queueMutationWithReceipt } from '../../../lib/syncService';
import { get, keys } from 'idb-keyval';

const audit = {
    state: 'STARTING',
    actorQueueKey, clearActorScopedOfflineData, processOfflineQueue, queueMutationWithReceipt,
    purgeRetiredWorkboxQueue, get, keys,
    login: (_id: number, _token: string) => {},
    attemptInvalidLogin: () => '',
    logout: () => {},
};
Object.assign(window, { offlineAudit: audit });

function Account() {
    const auth = useAuth();
    React.useEffect(() => {
        audit.login = (id, token) => auth.login({ id, email: `actor${id}@example.invalid`, name: `Fixture ${id}`, role: 'host' }, token);
        audit.attemptInvalidLogin = () => {
            try { auth.login({ id: 'wrong-type', role: 'admin' } as unknown as User, 'fixture-malformed'); return 'accepted'; }
            catch (error) { return error instanceof Error ? error.message : String(error); }
        };
        audit.logout = auth.logout;
        audit.state = 'READY';
    }, [auth]);
    return <p data-testid="actor">{auth.user?.id ?? 'signed-out'}</p>;
}

void ensureSafeOfflineWorker().then(() => {
    createRoot(document.getElementById('root')!).render(<AuthProvider><Account /></AuthProvider>);
}).catch(() => {
    audit.state = 'UPGRADE_REQUIRED';
    document.getElementById('root')!.textContent = 'Secure update required';
});
