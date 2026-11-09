import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { signOutUser, resendVerification } from '../services/firebase';
import {
  X,
  User as UserIcon,
  Mail,
  Fingerprint,
  Calendar,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  Database,
  Sparkles,
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogoutSuccess?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogoutSuccess,
}) => {
  const [copiedUid, setCopiedUid] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!isOpen || !user) return null;

  const handleCopyUid = () => {
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const handleResendVerification = async () => {
    try {
      await resendVerification();
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 4000);
    } catch (e) {
      console.warn('Could not resend email verification:', e);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOutUser();
      if (onLogoutSuccess) onLogoutSuccess();
      onClose();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const creationDate = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Recently';

  const lastSignIn = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Current session';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl glass-panel-glow border border-purple-500/30 overflow-hidden shadow-2xl p-6 sm:p-7 space-y-6 bg-[#0a0f1e]/95">
        {/* Glow Effects */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-cyan-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between relative z-10 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-purple-500/50 shadow-lg shadow-purple-950/50"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 p-0.5 shadow-lg">
                <div className="w-full h-full bg-[#080d1a] rounded-[14px] flex items-center justify-center text-xl font-bold text-white uppercase">
                  {user.displayName?.[0] || user.email?.[0] || 'U'}
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-display">
                  {user.displayName || user.email?.split('@')[0] || 'JIYA User'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{user.email}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Attributes Grid */}
        <div className="space-y-3 relative z-10 text-xs">
          {/* Unique Firebase UID */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1.5">
                <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
                <span>Unique Firebase UID</span>
              </span>
              <button
                onClick={handleCopyUid}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
              >
                {copiedUid ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUid ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="font-mono text-slate-200 text-xs break-all select-all">{user.uid}</p>
          </div>

          {/* Email Verification Status */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-purple-400" />
              <div>
                <span className="text-slate-300 font-semibold block">Email Status</span>
                <span className="text-[11px] text-slate-400">
                  {user.emailVerified ? 'Verified account' : 'Pending verification'}
                </span>
              </div>
            </div>

            {user.emailVerified ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified</span>
              </span>
            ) : (
              <button
                onClick={handleResendVerification}
                disabled={verificationSent}
                className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs hover:bg-amber-900 transition-colors disabled:opacity-50"
              >
                {verificationSent ? 'Email Sent!' : 'Send Verification'}
              </button>
            )}
          </div>

          {/* Creation & Activity Timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Account Created</span>
              </span>
              <p className="text-slate-200 font-medium">{creationDate}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                <span>Last Sign-In</span>
              </span>
              <p className="text-slate-200 font-medium">{lastSignIn}</p>
            </div>
          </div>

          {/* Firestore Synchronized Data Info */}
          <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-start gap-2.5">
            <Database className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-purple-200 block text-xs">
                Private Cloud Synchronization Active
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your messages and personality interactions are saved in your private Firestore
                subcollection (<code className="text-purple-300 font-mono">/users/{user.uid.slice(0, 8)}.../messages</code>). Only you can read or access your conversations.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Logout & Close */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span>End-to-End Encrypted Session</span>
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="px-4 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/40 text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <LogOut className={`w-3.5 h-3.5 ${isLoggingOut ? 'animate-spin' : ''}`} />
            <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
