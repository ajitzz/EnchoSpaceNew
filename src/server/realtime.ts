import type {Server, Socket} from 'socket.io';
export interface RealtimePrincipal {id: number;role: string;expiresAt: number}
export interface RealtimeAuthority {
  authenticate(token: string): Promise<RealtimePrincipal>;
  canAccessThread(principal: RealtimePrincipal, threadId: number): Promise<boolean>;
  isPublishedListing(listingId: number): Promise<boolean>;
  recheckMs?: number;
}
const id = (value: unknown): number | null => (typeof value === 'number' || typeof value === 'string') && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
/** Room membership is server authority. Client-supplied role/user IDs never grant access. */
export function registerSecureRealtime(io: Server, authority: RealtimeAuthority) {
  const authenticate = async (socket: Socket) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token || token.length > 8192) throw new Error('REALTIME_AUTH_REQUIRED');
    const principal = await authority.authenticate(token);
    if (!id(principal.id) || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= Date.now()) throw new Error('REALTIME_AUTH_REQUIRED');
    // Never replace remembered authority while retaining rooms granted under it.
    // A packet racing the periodic check must also revoke the old subscriptions.
    const previous = socket.data.principal as RealtimePrincipal | undefined;
    if (previous && (previous.id !== principal.id || previous.role !== principal.role)) {
      socket.disconnect(true);
      throw new Error('REALTIME_AUTH_REQUIRED');
    }
    return principal;
  };
  io.use(async (socket, next) => {
    if (!socket.handshake.auth?.token) return next(); // Only published-listing presence can be anonymous.
    try { socket.data.principal = await authenticate(socket); next(); }
    catch { next(new Error('REALTIME_AUTH_REQUIRED')); }
  });
  io.on('connection', socket => {
    let packets = 0, windowStart = Date.now(), checking = false;
    socket.use(async ([event, payload], next) => {
      try {
        if (Date.now() - windowStart >= 60_000) { packets = 0; windowStart = Date.now(); }
        if (++packets > 240 || socket.rooms.size > 50) throw new Error('limit');
        if (event === 'join_listing' || event === 'leave_listing') {
          const listingId = id(payload);
          if (!listingId || event === 'join_listing' && !await authority.isPublishedListing(listingId)) throw new Error('denied');
        } else {
          const principal = await authenticate(socket); socket.data.principal = principal;
          if (event === 'join_user') { if (id(payload) !== principal.id) throw new Error('denied'); }
          else if (event === 'join_admin') { if (principal.role !== 'admin') throw new Error('denied'); }
          else if (event === 'join_thread' || event === 'leave_thread' || event === 'typing_start' || event === 'typing_stop') {
            const threadId = id(event.startsWith('typing_') ? payload?.threadId : payload);
            if (!threadId || !await authority.canAccessThread(principal, threadId)) throw new Error('denied');
            if (event.startsWith('typing_') && !socket.rooms.has(`thread_${threadId}`)) throw new Error('denied');
          } else throw new Error('denied');
        }
        next();
      } catch { socket.emit('subscription_error', {code: 'REALTIME_SUBSCRIPTION_DENIED'}); next(new Error('REALTIME_SUBSCRIPTION_DENIED')); }
    });
    socket.on('error', () => { /* The caller receives the bounded subscription_error event above. */ });
    socket.on('join_user', () => { void socket.join(`user_${socket.data.principal.id}`); });
    socket.on('join_admin', () => { void socket.join('admin_room'); });
    socket.on('join_thread', threadId => { void socket.join(`thread_${id(threadId)}`); });
    socket.on('leave_thread', threadId => { void socket.leave(`thread_${id(threadId)}`); });
    for (const [incoming, outgoing] of [['typing_start', 'user_typing'], ['typing_stop', 'user_stopped_typing']]) {
      socket.on(incoming, payload => { socket.to(`thread_${id(payload.threadId)}`).emit(outgoing, {userId: socket.data.principal.id}); });
    }
    socket.on('join_listing', listingId => {
      const room = `listing_${id(listingId)}`; void socket.join(room);
      io.to(room).emit('listing_viewers', {viewers: io.sockets.adapter.rooms.get(room)?.size ?? 0});
    });
    socket.on('leave_listing', listingId => {
      const room = `listing_${id(listingId)}`; void socket.leave(room);
      io.to(room).emit('listing_viewers', {viewers: io.sockets.adapter.rooms.get(room)?.size ?? 0});
    });
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) if (room.startsWith('listing_')) socket.to(room).emit('listing_viewers', {viewers: Math.max(0, (io.sockets.adapter.rooms.get(room)?.size ?? 1) - 1)});
    });
    const timer = setInterval(async () => {
      if (checking || !socket.connected || !socket.data.principal) return;
      checking = true;
      try {
        const principal = await authenticate(socket);
        if (principal.id !== socket.data.principal.id || principal.role !== socket.data.principal.role) throw new Error('changed');
        for (const room of socket.rooms) if (room.startsWith('thread_') && !await authority.canAccessThread(principal, Number(room.slice(7)))) throw new Error('changed');
      } catch { socket.disconnect(true); } finally { checking = false; }
    }, authority.recheckMs ?? 30_000);
    timer.unref(); socket.on('disconnect', () => clearInterval(timer));
  });
}
