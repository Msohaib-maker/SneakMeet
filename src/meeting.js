// Full-mesh WebRTC meeting. The signaling server only relays connection
// setup; audio/video and the vitals data channel go directly peer-to-peer.

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export class Meeting {
  constructor(opts) {
    // opts: serverUrl, room, name, localStream, log,
    //       onPeerJoined(id, name), onPeerLeft(id), onPeerStream(id, stream),
    //       onPeerData(id, msg), onChannelOpen(id), onDisconnected()
    this.o = opts;
    this.peers = new Map();
    this.ws = null;
    this.id = null;
    this.closed = false;
    this.hostId = null;
    this.signalQueue = Promise.resolve();
  }

  join() {
    return new Promise((resolve, reject) => {
      const fail = (message) => reject(new Error(message));
      let ws;
      try { ws = new WebSocket(this.o.serverUrl); } catch (e) { fail(`Invalid server URL: ${e.message}`); return; }
      this.ws = ws;
      const timer = setTimeout(() => { fail('Could not reach the meeting server.'); ws.close(); }, 8000);

      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: this.o.room, name: this.o.name, host: !!this.o.host }));
      ws.onclose = () => {
        clearTimeout(timer);
        if (!this.id) fail('Could not reach the meeting server. Is it running?');
        else if (!this.closed) this.o.onDisconnected?.();
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'joined':
            clearTimeout(timer);
            this.id = msg.id;
            this.hostId = msg.hostId || null;
            resolve();
            // The newcomer offers to everyone already in the room (avoids glare).
            for (const p of msg.peers) this._createPeer(p.id, p.name, true);
            break;
          case 'peer-joined':
            if ((msg.hostId || null) !== this.hostId) {
              this.hostId = msg.hostId || null;
              this.o.onHostChanged?.(this.hostId);
            }
            this._createPeer(msg.id, msg.name, false);
            break;
          case 'host-changed':
            this.hostId = msg.hostId || null;
            this.o.onHostChanged?.(this.hostId);
            break;
          case 'peer-left':
            this._removePeer(msg.id);
            break;
          case 'signal':
            // Process signals strictly in order.
            this.signalQueue = this.signalQueue.then(() => this._onSignal(msg.from, msg.data));
            break;
          case 'error':
            clearTimeout(timer);
            fail(msg.message);
            ws.close();
            break;
          default:
        }
      };
    });
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  _signal(to, data) { this._send({ type: 'signal', to, data }); }

  _createPeer(id, name, initiator) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peer = { id, name, pc, dc: null, pendingCandidates: [] };
    this.peers.set(id, peer);
    this.o.onPeerJoined?.(id, name);

    for (const track of this.o.localStream.getTracks()) pc.addTrack(track, this.o.localStream);

    pc.onicecandidate = (e) => { if (e.candidate) this._signal(id, { candidate: e.candidate }); };
    pc.ontrack = (e) => { if (e.streams[0]) this.o.onPeerStream?.(id, e.streams[0]); };
    pc.onconnectionstatechange = () => {
      this.o.log?.(`${name}: ${pc.connectionState}`);
    };

    if (initiator) {
      this._setupChannel(peer, pc.createDataChannel('state'));
      (async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this._signal(id, { sdp: pc.localDescription });
        } catch (e) { this.o.log?.(`Offer to ${name} failed: ${e.message}`); }
      })();
    } else {
      pc.ondatachannel = (e) => this._setupChannel(peer, e.channel);
    }
    return peer;
  }

  _setupChannel(peer, dc) {
    peer.dc = dc;
    dc.onopen = () => this.o.onChannelOpen?.(peer.id);
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 4096) return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.o.onPeerData?.(peer.id, msg);
    };
  }

  async _onSignal(from, data) {
    const peer = this.peers.get(from) || this._createPeer(from, 'Guest', false);
    const { pc } = peer;
    try {
      if (data && data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        for (const c of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this._signal(from, { sdp: pc.localDescription });
        }
      } else if (data && data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else peer.pendingCandidates.push(data.candidate);
      }
    } catch (e) {
      this.o.log?.(`Signaling with ${peer.name} failed: ${e.message}`);
    }
  }

  _removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try { peer.pc.close(); } catch { /* ignore */ }
    this.peers.delete(id);
    this.o.onPeerLeft?.(id);
  }

  sendTo(id, msg) {
    const dc = this.peers.get(id)?.dc;
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const { dc } of this.peers.values()) if (dc && dc.readyState === 'open') dc.send(data);
  }

  leave() {
    this.closed = true;
    for (const peer of this.peers.values()) { try { peer.pc.close(); } catch { /* ignore */ } }
    this.peers.clear();
    if (this.ws) this.ws.close();
  }
}
