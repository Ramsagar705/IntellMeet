import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Camera, CameraOff, Mic, MicOff, MessageCircle, MonitorUp, PhoneOff, ScreenShare, Users } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';
import type { Meeting } from '../types';

interface Participant {
  participantId: string;
  userId: string;
  name: string;
  avatar: string;
  role: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenshareEnabled: boolean;
  connectionStatus: string;
}

interface ChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}

interface JoinResult {
  ok: boolean;
  status?: number;
  message?: string;
  participantId?: string;
  participants?: Participant[];
}

interface SignalPayload {
  meetingId: string;
  fromId: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const getMediaErrorMessage = (error: unknown) => {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera or microphone permission was denied. Allow access for this site in browser permissions, then use the device button to try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone was found. You can still join and view the meeting.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your camera or microphone is unavailable. It may be in use by another application.';
  }
  return 'Could not access your camera or microphone. Check browser permissions and try again.';
};

function ParticipantTile({
  participant,
  stream,
  isSelf = false,
}: {
  participant: Participant;
  stream?: MediaStream;
  isSelf?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream && (participant.cameraEnabled || participant.screenshareEnabled));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="relative min-h-56 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        className={`h-full min-h-56 w-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
      />
      {!hasVideo ? (
        <div className="flex min-h-56 h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
          {participant.avatar ? (
            <img src={participant.avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-2xl font-semibold text-white">
              {participant.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-slate-950/95 to-transparent px-4 pb-3 pt-8">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{participant.name}{isSelf ? ' (You)' : ''}</p>
          <p className="text-xs text-slate-300">{participant.role}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-200">
          {participant.screenshareEnabled ? <MonitorUp className="h-4 w-4 text-sky-300" aria-label="Sharing screen" /> : null}
          {participant.micEnabled ? <Mic className="h-4 w-4 text-emerald-300" aria-label="Microphone on" /> : <MicOff className="h-4 w-4 text-rose-300" aria-label="Microphone off" />}
          {!participant.cameraEnabled && !participant.screenshareEnabled ? <CameraOff className="h-4 w-4 text-rose-300" aria-label="Camera off" /> : null}
        </div>
      </div>
    </div>
  );
}

interface MeetingRoomPageProps {
  meetingId?: string;
  minimized?: boolean;
  onLeave?: () => void;
}

export default function MeetingRoomPage({
  meetingId: meetingIdProp,
  minimized = false,
  onLeave,
}: MeetingRoomPageProps) {
  const { meetingId: routeMeetingId = '' } = useParams();
  const meetingId = meetingIdProp || routeMeetingId;
  const isValidMeetingId = /^[a-z\d_-]{1,128}$/i.test(meetingId);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraEnabledRef = useRef(true);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const participantNamesRef = useRef(new Map<string, string>());
  const leavingRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const [fatalRoomErrorMeetingId, setFatalRoomErrorMeetingId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const meetingQuery = useQuery({
    queryKey: ['meeting-room', meetingId],
    queryFn: async () => {
      const { data } = await api.get<Meeting>(`/meetings/${meetingId}`);
      return data;
    },
    enabled: isValidMeetingId,
    retry: false,
  });
  const meeting = meetingQuery.data || null;
  const meetingLoading = isValidMeetingId && meetingQuery.isPending;
  const [roomError, setRoomError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [webRtcError, setWebRtcError] = useState('');
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);

  const closePeerConnections = useCallback(() => {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    setRemoteStreams({});
  }, []);

  const stopLocalMedia = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    localStreamRef.current = null;
    setScreenStream(null);
    setLocalStream(null);
  }, []);

  const leaveCall = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    closePeerConnections();
    stopLocalMedia();
    const socket = socketRef.current;
    socketRef.current = null;
    if (!socket) {
      navigate('/meetings', { replace: true });
      return;
    }

    let finished = false;
    const finishLeaving = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      socket.removeAllListeners();
      socket.disconnect();
      if (onLeave) onLeave();
      else navigate('/meetings', { replace: true });
    };
    const timeout = window.setTimeout(finishLeaving, 1000);
    socket.emit('meeting:leave', {}, finishLeaving);
  }, [closePeerConnections, navigate, onLeave, stopLocalMedia]);

  useEffect(() => {
    if (!meeting || !isValidMeetingId || !token) return undefined;
    let cancelled = false;
    leavingRef.current = false;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      autoConnect: false,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 8,
    });
    socketRef.current = socket;

    const emitOffer = async (peerId: string, peer: RTCPeerConnection) => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('webrtc:offer', { meetingId, targetId: peerId, offer: peer.localDescription });
      } catch {
        setWebRtcError('Could not create a connection offer. Try rejoining the meeting.');
      }
    };

    const createPeer = (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peersRef.current.set(peerId, peer);
      localStreamRef.current?.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current as MediaStream);
      });
      screenStreamRef.current?.getVideoTracks().forEach((track) => {
        const videoSender = peer.getSenders().find((sender) => sender.track?.kind === 'video');
        if (videoSender) void videoSender.replaceTrack(track);
        else peer.addTrack(track, screenStreamRef.current as MediaStream);
      });
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', {
            meetingId,
            targetId: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      peer.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          setWebRtcError('A peer-to-peer connection failed. Check network/firewall settings or rejoin.');
        }
        if (peer.connectionState === 'connected') setWebRtcError('');
      };
      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === 'failed') {
          setWebRtcError('Could not establish a media connection. Your network may require a TURN server.');
        }
      };
      return peer;
    };

    const updateMediaFlag = (
      participantId: string,
      key: 'micEnabled' | 'cameraEnabled' | 'screenshareEnabled',
      enabled: boolean
    ) => {
      setParticipants((current) => current.map((participant) =>
        participant.participantId === participantId ? { ...participant, [key]: enabled } : participant
      ));
    };

    const applyCandidates = async (peerId: string, peer: RTCPeerConnection) => {
      const queued = pendingCandidatesRef.current.get(peerId) || [];
      pendingCandidatesRef.current.delete(peerId);
      for (const candidate of queued) {
        await peer.addIceCandidate(candidate);
      }
    };

    const handleJoinResult = (result: JoinResult) => {
      if (!result.ok) {
        setRoomError(result.message || 'Could not join this meeting.');
        setFatalRoomErrorMeetingId(meetingId);
        setSocketStatus('disconnected');
        socket.disconnect();
        return;
      }
      setFatalRoomErrorMeetingId('');
      setParticipantId(result.participantId || '');
      const joinedParticipants = result.participants || [];
      participantNamesRef.current = new Map(joinedParticipants.map((participant) => [
        participant.participantId,
        participant.name,
      ]));
      setParticipants(joinedParticipants);
      const stream = localStreamRef.current;
      const audioEnabled = Boolean(stream?.getAudioTracks().some((track) => track.enabled));
      const videoEnabled = Boolean(stream?.getVideoTracks().some((track) => track.enabled));
      socket.emit('participant:mic', { enabled: audioEnabled });
      socket.emit('participant:camera', { enabled: videoEnabled });
      socket.emit('participant:screenshare', { enabled: Boolean(screenStreamRef.current) });
    };

    socket.on('connect', () => {
      setSocketStatus('connected');
      setRoomError('');
      socket.emit('meeting:join', { meetingId }, handleJoinResult);
    });
    socket.on('connect_error', (error) => {
      setSocketStatus('reconnecting');
      if (/authentication|token/i.test(error.message)) {
        setRoomError('Socket authentication failed. Please sign in again.');
        setFatalRoomErrorMeetingId(meetingId);
        setSocketStatus('disconnected');
        socket.disconnect();
      } else {
        setRoomError('Unable to connect to the meeting service. Reconnecting...');
      }
    });
    socket.on('disconnect', () => {
      if (leavingRef.current || cancelled) return;
      setSocketStatus('reconnecting');
      closePeerConnections();
      setParticipants([]);
      setParticipantId('');
      participantNamesRef.current.clear();
    });
    socket.on('meeting:joined', handleJoinResult);
    socket.on('meeting:participants', (updated: Participant[]) => {
      participantNamesRef.current = new Map(updated.map((participant) => [
        participant.participantId,
        participant.name,
      ]));
      setParticipants(updated);
    });
    socket.on('meeting:user-joined', (participant: Participant) => {
      participantNamesRef.current.set(participant.participantId, participant.name);
      setParticipants((current) => current.some((item) => item.participantId === participant.participantId)
        ? current
        : [...current, participant]);
      const peer = createPeer(participant.participantId);
      void emitOffer(participant.participantId, peer);
    });
    socket.on('meeting:user-left', ({ participantId }: { participantId: string }) => {
      const name = participantNamesRef.current.get(participantId);
      participantNamesRef.current.delete(participantId);
      peersRef.current.get(participantId)?.close();
      peersRef.current.delete(participantId);
      pendingCandidatesRef.current.delete(participantId);
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[participantId];
        return next;
      });
      setParticipants((current) => current.filter((item) => item.participantId !== participantId));
      if (name) setTypingNames((current) => current.filter((typingName) => typingName !== name));
    });

    socket.on('webrtc:offer', async (payload: SignalPayload) => {
      if (payload.meetingId !== meetingId || !payload.offer) return;
      try {
        const peer = createPeer(payload.fromId);
        await peer.setRemoteDescription(payload.offer);
        await applyCandidates(payload.fromId, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('webrtc:answer', { meetingId, targetId: payload.fromId, answer: peer.localDescription });
      } catch {
        setWebRtcError('Could not establish a peer connection. Try leaving and rejoining.');
      }
    });
    socket.on('webrtc:answer', async (payload: SignalPayload) => {
      if (payload.meetingId !== meetingId || !payload.answer) return;
      const peer = peersRef.current.get(payload.fromId);
      if (!peer) return;
      try {
        await peer.setRemoteDescription(payload.answer);
        await applyCandidates(payload.fromId, peer);
      } catch {
        setWebRtcError('Could not complete the peer connection. Try leaving and rejoining.');
      }
    });
    socket.on('webrtc:ice-candidate', async (payload: SignalPayload) => {
      if (payload.meetingId !== meetingId || !payload.candidate) return;
      try {
        const peer = createPeer(payload.fromId);
        if (peer.remoteDescription) {
          await peer.addIceCandidate(payload.candidate);
        } else {
          const pending = pendingCandidatesRef.current.get(payload.fromId) || [];
          pending.push(payload.candidate);
          pendingCandidatesRef.current.set(payload.fromId, pending);
        }
      } catch {
        setWebRtcError('Could not apply a network candidate. Rejoin if media does not connect.');
      }
    });
    socket.on('participant:mic', ({ participantId, enabled }: { participantId: string; enabled: boolean }) => {
      updateMediaFlag(participantId, 'micEnabled', enabled);
    });
    socket.on('participant:camera', ({ participantId, enabled }: { participantId: string; enabled: boolean }) => {
      updateMediaFlag(participantId, 'cameraEnabled', enabled);
    });
    socket.on('participant:screenshare', ({ participantId, enabled }: { participantId: string; enabled: boolean }) => {
      updateMediaFlag(participantId, 'screenshareEnabled', enabled);
    });
    socket.on('chat:receive', (chatMessage: ChatMessage) => {
      if (chatMessage.meetingId === meetingId) setMessages((current) => [...current, chatMessage]);
    });
    socket.on('chat:typing', ({ participantId, senderName }: { participantId: string; senderName: string }) => {
      if (participantId !== socket.id) {
        setTypingNames((current) => current.includes(senderName) ? current : [...current, senderName]);
      }
    });
    socket.on('chat:stop-typing', ({ participantId }: { participantId: string }) => {
      const senderName = participantNamesRef.current.get(participantId);
      if (senderName) setTypingNames((current) => current.filter((name) => name !== senderName));
    });

    const join = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError(window.isSecureContext
          ? 'Camera and microphone access is not available in this browser.'
          : 'Camera and microphone access requires HTTPS or localhost. You can still join and view the meeting.');
        setMicEnabled(false);
        setCameraEnabled(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicEnabled(stream.getAudioTracks().some((track) => track.enabled));
        const hasEnabledCamera = stream.getVideoTracks().some((track) => track.enabled);
        cameraEnabledRef.current = hasEnabledCamera;
        setCameraEnabled(hasEnabledCamera);
        for (const [peerId, peer] of peersRef.current) {
          stream.getTracks().forEach((track) => {
            if (!peer.getSenders().some((sender) => sender.track === track)) {
              peer.addTrack(track, stream);
            }
          });
          if (peer.signalingState !== 'stable') {
            await new Promise<void>((resolve) => {
              const onSignalingStateChange = () => {
                if (peer.signalingState === 'stable' || peer.signalingState === 'closed') {
                  peer.removeEventListener('signalingstatechange', onSignalingStateChange);
                  resolve();
                }
              };
              peer.addEventListener('signalingstatechange', onSignalingStateChange);
              onSignalingStateChange();
            });
          }
          if (!cancelled && peer.signalingState === 'stable') await emitOffer(peerId, peer);
        }
        if (socket.connected) {
          socket.emit('participant:mic', { enabled: stream.getAudioTracks().some((track) => track.enabled) });
          socket.emit('participant:camera', { enabled: hasEnabledCamera });
        }
      } catch (error) {
        if (!cancelled) {
          setMediaError(getMediaErrorMessage(error));
          setMicEnabled(false);
          cameraEnabledRef.current = false;
          setCameraEnabled(false);
        }
      }
    };
    socket.connect();
    void join();

    return () => {
      cancelled = true;
      socket.off();
      if (socket.connected) socket.emit('meeting:leave');
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      closePeerConnections();
      stopLocalMedia();
      setParticipants([]);
      setParticipantId('');
      participantNamesRef.current.clear();
      setMessages([]);
      setTypingNames([]);
    };
  }, [meeting, meetingId, isValidMeetingId, token, closePeerConnections, stopLocalMedia]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingNames]);

  const ensureMediaTrack = async (kind: 'audio' | 'video') => {
    const currentStream = localStreamRef.current;
    const existingTrack = kind === 'audio' ? currentStream?.getAudioTracks()[0] : currentStream?.getVideoTracks()[0];
    if (existingTrack) return existingTrack;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Media devices are unavailable');
    const newStream = await navigator.mediaDevices.getUserMedia(
      kind === 'audio' ? { audio: true, video: false } : { audio: false, video: true }
    );
    const track = kind === 'audio' ? newStream.getAudioTracks()[0] : newStream.getVideoTracks()[0];
    if (!track) throw new Error(`No ${kind} track was returned`);
    if (!currentStream) {
      localStreamRef.current = newStream;
      setLocalStream(newStream);
    } else {
      currentStream.addTrack(track);
      setLocalStream(new MediaStream(currentStream.getTracks()));
    }
    const trackStream = localStreamRef.current as MediaStream;
    for (const [peerId, peer] of peersRef.current) {
      peer.addTrack(track, trackStream);
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socketRef.current?.emit('webrtc:offer', {
          meetingId,
          targetId: peerId,
          offer: peer.localDescription,
        });
      } catch {
        setWebRtcError('Could not renegotiate media after enabling your device.');
      }
    }
    return track;
  };

  const toggleMicrophone = async () => {
    try {
      const next = !micEnabled;
      const track = await ensureMediaTrack('audio');
      track.enabled = next;
      setMicEnabled(next);
      setMediaError('');
      socketRef.current?.emit('participant:mic', { enabled: next });
    } catch (error) {
      setMediaError(error instanceof DOMException ? getMediaErrorMessage(error) : 'Could not enable your microphone.');
    }
  };

  const toggleCamera = async () => {
    try {
      const next = !cameraEnabled;
      const track = await ensureMediaTrack('video');
      track.enabled = next;
      cameraEnabledRef.current = next;
      setCameraEnabled(next);
      setMediaError('');
      if (!screenStreamRef.current) {
        const stream = localStreamRef.current;
        if (stream) setLocalStream(new MediaStream(stream.getTracks()));
      }
      socketRef.current?.emit('participant:camera', { enabled: next });
    } catch (error) {
      setMediaError(error instanceof DOMException ? getMediaErrorMessage(error) : 'Could not enable your camera.');
    }
  };

  const stopScreenSharing = useCallback(async () => {
    const activeScreen = screenStreamRef.current;
    if (!activeScreen) return;
    activeScreen.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenStreamRef.current = null;
    setScreenStream(null);
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    if (cameraTrack) cameraTrack.enabled = cameraEnabledRef.current;
    for (const peer of peersRef.current.values()) {
      const sender = peer.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) await sender.replaceTrack(cameraTrack);
    }
    socketRef.current?.emit('participant:screenshare', { enabled: false });
  }, []);

  const toggleScreenShare = async () => {
    if (screenStreamRef.current) {
      await stopScreenSharing();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((item) => item.stop());
        setMediaError('The browser did not provide a screen-share video track.');
        return;
      }
      screenStreamRef.current = stream;
      setScreenStream(stream);
      track.onended = () => void stopScreenSharing();
      for (const [peerId, peer] of peersRef.current) {
        const sender = peer.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(track);
        } else {
          peer.addTrack(track, localStreamRef.current || stream);
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socketRef.current?.emit('webrtc:offer', {
            meetingId,
            targetId: peerId,
            offer: peer.localDescription,
          });
        }
      }
      setMediaError('');
      socketRef.current?.emit('participant:screenshare', { enabled: true });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        setMediaError('Screen-share permission was denied. Please allow screen sharing in your browser.');
      } else {
        setMediaError('Could not start screen sharing.');
      }
    }
  };

  const sendMessage = () => {
    const text = message.trim();
    if (!text || !socketRef.current?.connected) return;
    socketRef.current.emit('chat:send', { meetingId, message: text }, (result: { ok: boolean; message?: string }) => {
      if (!result?.ok) {
        setRoomError(result?.message || 'Could not send your message.');
        return;
      }
      setRoomError('');
    });
    socketRef.current.emit('chat:stop-typing');
    setMessage('');
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (value.trim()) socketRef.current?.emit('chat:typing');
    else socketRef.current?.emit('chat:stop-typing');
  };

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl">
        <button
          type="button"
          onClick={() => navigate(`/room/${meetingId}`)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            <span className={`h-2 w-2 rounded-full ${socketStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {socketStatus === 'connected' ? 'Meeting is live' : socketStatus === 'reconnecting' ? 'Reconnecting...' : 'Meeting in progress'}
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-white">
            {meeting?.title || 'Return to meeting'}
          </span>
        </button>
        <button
          type="button"
          onClick={leaveCall}
          disabled={leaving}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
        >
          <PhoneOff className="h-4 w-4" />
          {leaving ? 'Leaving...' : 'Leave'}
        </button>
      </div>
    );
  }

  if (meetingLoading) {
    return <div className="min-h-screen bg-slate-950 p-8 text-slate-200">Loading meeting...</div>;
  }

  if (!meeting || fatalRoomErrorMeetingId === meetingId) {
    const loadError = isAxiosError(meetingQuery.error)
      ? meetingQuery.error.response?.status === 401
        ? 'Your session is no longer valid. Please sign in again.'
        : meetingQuery.error.response?.status === 403 || meetingQuery.error.response?.status === 404
          ? 'Meeting not found or you do not have access to it.'
          : 'Could not load this meeting. Check your connection and try again.'
      : roomError || 'Meeting not found or you do not have access to it.';
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <div className="glass mx-auto max-w-2xl rounded-3xl p-6">
          <p role="alert" className="text-rose-200">{loadError}</p>
          <Link to="/meetings" className="mt-4 inline-block text-sky-300 hover:text-sky-200">Back to meetings</Link>
        </div>
      </div>
    );
  }

  const ownParticipant: Participant = {
    participantId: participantId || 'local',
    userId: user?.id || '',
    name: user?.name || 'You',
    avatar: user?.avatar || '',
    role: meeting.createdBy === user?.id ? 'Host' : 'Member',
    micEnabled,
    cameraEnabled,
    screenshareEnabled: Boolean(screenStream),
    connectionStatus: socketStatus,
  };
  const visibleParticipants = participants.filter((participant) => participant.participantId !== participantId);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">
              {socketStatus === 'connected' ? 'Live meeting' : socketStatus === 'reconnecting' ? 'Reconnecting...' : 'Meeting room'}
            </p>
            <h1 className="mt-2 truncate text-3xl font-bold text-white">{meeting.title}</h1>
          </div>
          <button
            type="button"
            onClick={leaveCall}
            disabled={leaving}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 font-medium text-white hover:bg-rose-400 disabled:opacity-60"
          >
            <PhoneOff className="h-4 w-4" />
            {leaving ? 'Leaving...' : 'Leave call'}
          </button>
        </div>

        {roomError ? <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{roomError}</p> : null}
        {mediaError ? <p role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{mediaError}</p> : null}
        {webRtcError ? <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{webRtcError}</p> : null}
        {socketStatus === 'reconnecting' ? <p className="mb-4 text-sm text-amber-200">Reconnecting to the meeting service...</p> : null}

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <span className={`h-2 w-2 rounded-full ${socketStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {socketStatus === 'connected' ? 'Live now' : socketStatus === 'reconnecting' ? 'Reconnecting...' : 'Connecting...'}
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Users className="h-4 w-4" />
                {socketStatus === 'connected' ? `${participants.length} participants` : '— participants'}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ParticipantTile participant={ownParticipant} stream={screenStream || localStream || undefined} isSelf />
              {visibleParticipants.map((participant) => (
                <ParticipantTile
                  key={participant.participantId}
                  participant={participant}
                  stream={remoteStreams[participant.participantId]}
                />
              ))}
              {socketStatus === 'connected' && visibleParticipants.length === 0 ? (
                <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
                  You’re the only participant here right now. Others will appear when they join.
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void toggleMicrophone()}
                disabled={socketStatus !== 'connected'}
                aria-pressed={micEnabled}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm hover:border-sky-500 disabled:opacity-50 ${micEnabled ? 'border-slate-700 bg-slate-900/80 text-slate-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'}`}
              >
                {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {micEnabled ? 'Mic on' : 'Mic off'}
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                disabled={socketStatus !== 'connected'}
                aria-pressed={cameraEnabled}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm hover:border-sky-500 disabled:opacity-50 ${cameraEnabled ? 'border-slate-700 bg-slate-900/80 text-slate-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'}`}
              >
                {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                {cameraEnabled ? 'Camera on' : 'Camera off'}
              </button>
              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                disabled={socketStatus !== 'connected'}
                aria-pressed={Boolean(screenStream)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm hover:border-sky-500 disabled:opacity-50 ${screenStream ? 'border-sky-500/40 bg-sky-500/10 text-sky-200' : 'border-slate-700 bg-slate-900/80 text-slate-200'}`}
              >
                {screenStream ? <MonitorUp className="h-4 w-4" /> : <ScreenShare className="h-4 w-4" />}
                {screenStream ? 'Stop sharing' : 'Share screen'}
              </button>
              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                disabled={socketStatus !== 'connected'}
                aria-label={screenStream ? 'Stop screen sharing' : 'Screenshare'}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 hover:border-sky-500 disabled:opacity-50"
              >
                <MonitorUp className="h-4 w-4" />
                {screenStream ? 'Sharing' : 'Screenshare'}
              </button>
            </div>
          </div>

          {chatOpen ? (
            <div className="glass flex min-h-[32rem] flex-col rounded-3xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Meeting chat</h2>
                <button type="button" onClick={() => setChatOpen(false)} className="text-sm text-slate-300">Hide</button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto">
                {messages.length === 0 && socketStatus === 'connected' ? (
                  <p className="py-6 text-center text-sm text-slate-400">No messages yet. Start the conversation.</p>
                ) : null}
                {messages.map((chatMessage) => {
                  const ownMessage = chatMessage.senderId === user?.id;
                  return (
                    <div
                      key={chatMessage.id}
                      className={`rounded-xl border p-3 ${ownMessage ? 'border-sky-500/30 bg-sky-500/10' : 'border-slate-700 bg-slate-900/80'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold uppercase tracking-wide text-sky-300">
                          {ownMessage ? 'You' : chatMessage.senderName}
                        </p>
                        <time className="shrink-0 text-[10px] text-slate-400">
                          {new Date(chatMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                      <p className="mt-1 break-words text-sm text-slate-100">{chatMessage.message}</p>
                    </div>
                  );
                })}
                {typingNames.length ? <p className="text-xs text-slate-400">{typingNames.join(', ')} typing...</p> : null}
                <div ref={messageEndRef} />
              </div>

              <form
                className="mt-5 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage();
                }}
              >
                <input
                  value={message}
                  onChange={(event) => handleMessageChange(event.target.value)}
                  onBlur={() => socketRef.current?.emit('chat:stop-typing')}
                  placeholder={socketStatus === 'connected' ? 'Type a message...' : 'Connecting to meeting chat...'}
                  maxLength={4000}
                  disabled={socketStatus !== 'connected'}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-white disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!message.trim() || socketStatus !== 'connected'}
                  className="rounded-xl bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-400 disabled:opacity-50"
                  aria-label="Send message"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <button onClick={() => setChatOpen(true)} className="glass flex items-center justify-center rounded-3xl p-5 text-sky-300">
              <MessageCircle className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
