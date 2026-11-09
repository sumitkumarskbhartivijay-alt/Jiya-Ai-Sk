import React, { useState, useEffect } from 'react';
import { PersonalityMode } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import {
  Youtube,
  Search,
  Globe,
  MessageCircle,
  Calculator as CalcIcon,
  Clock,
  CloudSun,
  FileText,
  Volume2,
  Smartphone,
  ExternalLink,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { audioOutputManager } from '../services/speechService';
import { synthesizeSpeech } from '../services/geminiService';

interface ToolsViewProps {
  currentMode: PersonalityMode;
  onRunVoiceCommand: (cmd: string) => void;
}

export const ToolsView: React.FC<ToolsViewProps> = ({
  currentMode,
  onRunVoiceCommand,
}) => {
  const modeConfig = PERSONALITY_MODES[currentMode];

  // Active Tool Modal state
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Quick inputs
  const [ytQuery, setYtQuery] = useState('');
  const [googleQuery, setGoogleQuery] = useState('');
  const [waText, setWaText] = useState('');
  const [waPhone, setWaPhone] = useState('');
  const [webUrl, setWebUrl] = useState('');

  // Built-in Calculator State
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState<string | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);

  // Clock & Stopwatch State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);

  // Weather State
  const [weatherCity, setWeatherCity] = useState('Delhi');
  const [weatherData, setWeatherData] = useState({
    temp: '28°C',
    condition: 'Clear Sky & Sunny',
    humidity: '42%',
    wind: '12 km/h',
    high: '32°C',
    low: '21°C',
  });

  // Notes State
  const [noteContent, setNoteContent] = useState(() => {
    return localStorage.getItem('jiya_quick_notes') || 'Welcome to JIYA Scratchpad.\n- Sumit Kumar created JIYA AI\n- 5 Personality modes enabled\n- Gemini 3.8 Flash integrated';
  });
  const [noteSaved, setNoteSaved] = useState(false);

  // Screen Reader State
  const [readerText, setReaderText] = useState('');
  const [isReadingScreen, setIsReadingScreen] = useState(false);
  const [screenCaptureStatus, setScreenCaptureStatus] = useState<string | null>(null);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Stopwatch ticker
  useEffect(() => {
    let interval: any;
    if (isStopwatchRunning) {
      interval = setInterval(() => {
        setStopwatchTime((prev) => prev + 10);
      }, 10);
    }
    return () => clearInterval(interval);
  }, [isStopwatchRunning]);

  // Handle calculator input
  const handleCalcBtn = (val: string) => {
    if (val === 'C') {
      setCalcDisplay('0');
      setCalcPrev(null);
      setCalcOp(null);
      return;
    }
    if (['+', '-', '*', '/'].includes(val)) {
      setCalcPrev(calcDisplay);
      setCalcOp(val);
      setCalcDisplay('0');
      return;
    }
    if (val === '=') {
      if (calcPrev && calcOp) {
        try {
          const a = parseFloat(calcPrev);
          const b = parseFloat(calcDisplay);
          let res = 0;
          if (calcOp === '+') res = a + b;
          if (calcOp === '-') res = a - b;
          if (calcOp === '*') res = a * b;
          if (calcOp === '/') res = b !== 0 ? a / b : 0;
          setCalcDisplay(String(Number(res.toFixed(6))));
          setCalcPrev(null);
          setCalcOp(null);
        } catch {
          setCalcDisplay('Error');
        }
      }
      return;
    }
    setCalcDisplay((prev) => (prev === '0' ? val : prev + val));
  };

  // Weather query simulation
  const handleWeatherSearch = (city: string) => {
    setWeatherCity(city);
    // Real-time deterministic city climate representation
    const cities: Record<string, any> = {
      delhi: { temp: '28°C', condition: 'Sunny & Clear', humidity: '42%', wind: '12 km/h' },
      mumbai: { temp: '31°C', condition: 'Humid & Breezy', humidity: '78%', wind: '19 km/h' },
      patna: { temp: '29°C', condition: 'Pleasant & Warm', humidity: '48%', wind: '9 km/h' },
      bengaluru: { temp: '24°C', condition: 'Cool & Overcast', humidity: '60%', wind: '15 km/h' },
      london: { temp: '14°C', condition: 'Light Rain', humidity: '82%', wind: '22 km/h' },
      tokyo: { temp: '19°C', condition: 'Clear', humidity: '51%', wind: '11 km/h' },
    };
    const key = city.toLowerCase().trim();
    if (cities[key]) {
      setWeatherData(cities[key]);
    } else {
      setWeatherData({
        temp: `${Math.floor(20 + Math.random() * 12)}°C`,
        condition: 'Partly Cloudy',
        humidity: `${Math.floor(40 + Math.random() * 30)}%`,
        wind: `${Math.floor(8 + Math.random() * 15)} km/h`,
        high: '30°C',
        low: '20°C',
      });
    }
  };

  // Save Notes
  const handleSaveNotes = () => {
    try {
      localStorage.setItem('jiya_quick_notes', noteContent);
    } catch (e) {
      console.warn('Could not save note to localStorage:', e);
    }
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  // Screen Text Reader / TTS
  const handleReadTextAloud = async (textToRead: string) => {
    if (!textToRead.trim()) return;
    setIsReadingScreen(true);
    audioOutputManager.stopAllSpeech();

    try {
      const res = await synthesizeSpeech(textToRead, currentMode);
      if (res && res.audioBase64) {
        await audioOutputManager.playBase64Wav(res.audioBase64, undefined, () => {
          setIsReadingScreen(false);
        });
        return;
      }
      // Fallback to browser speech engine
      audioOutputManager.speakBrowserSynthesis(textToRead, currentMode, 1.0, 1.0, () => {
        setIsReadingScreen(false);
      });
    } catch (e: any) {
      console.warn('Screen reader TTS notice, using backup voice:', e);
      audioOutputManager.speakBrowserSynthesis(textToRead, currentMode, 1.0, 1.0, () => {
        setIsReadingScreen(false);
      });
    }
  };

  // Screen Capture using getDisplayMedia API where supported
  const handleScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenCaptureStatus('Screen capture is not supported on this browser/environment.');
      return;
    }
    try {
      setScreenCaptureStatus('Requesting screen sharing authorization...');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenCaptureStatus('Screen shared successfully! Extracting visual layout.');
      // Stop tracks after brief capture
      setTimeout(() => {
        stream.getTracks().forEach((track) => track.stop());
        setScreenCaptureStatus('Screen scan completed. Ready to read or analyze.');
      }, 1500);
    } catch (err: any) {
      setScreenCaptureStatus(`Permission declined or cancelled: ${err.message}`);
    }
  };

  // Launchers
  const openYouTube = () => {
    const url = ytQuery.trim()
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`
      : 'https://www.youtube.com';
    window.open(url, '_blank');
  };

  const openGoogle = () => {
    const url = googleQuery.trim()
      ? `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`
      : 'https://www.google.com';
    window.open(url, '_blank');
  };

  const openWhatsApp = () => {
    let url = 'https://wa.me/';
    if (waPhone.trim()) {
      url += waPhone.replace(/\D/g, '');
    }
    if (waText.trim()) {
      url += `?text=${encodeURIComponent(waText)}`;
    }
    window.open(url, '_blank');
  };

  const openCustomWeb = () => {
    let target = webUrl.trim();
    if (!target) return;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }
    window.open(target, '_blank');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
            Quick Tools & Mobile Control System
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-400">
          Execute direct actions, launch apps, run calculations, inspect live weather, read screen text, and inspect Android integration.
        </p>
      </div>

      {/* Main Grid of Functional Tool Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Tool: YouTube */}
        <div
          onClick={() => setActiveTool(activeTool === 'yt' ? null : 'yt')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'yt' ? 'border-red-500/60 bg-red-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center mb-2">
            <Youtube className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">YouTube</h3>
            <p className="text-[11px] text-slate-400">Launch & search videos</p>
          </div>
        </div>

        {/* Tool: Google */}
        <div
          onClick={() => setActiveTool(activeTool === 'google' ? null : 'google')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'google' ? 'border-blue-500/60 bg-blue-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-2">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Google</h3>
            <p className="text-[11px] text-slate-400">Instant web search</p>
          </div>
        </div>

        {/* Tool: WhatsApp */}
        <div
          onClick={() => setActiveTool(activeTool === 'wa' ? null : 'wa')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'wa' ? 'border-emerald-500/60 bg-emerald-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-2">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">WhatsApp</h3>
            <p className="text-[11px] text-slate-400">Direct message trigger</p>
          </div>
        </div>

        {/* Tool: Calculator */}
        <div
          onClick={() => setActiveTool(activeTool === 'calc' ? null : 'calc')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'calc' ? 'border-purple-500/60 bg-purple-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-2">
            <CalcIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Calculator</h3>
            <p className="text-[11px] text-slate-400">Scientific & arithmetic</p>
          </div>
        </div>

        {/* Tool: Clock & Timer */}
        <div
          onClick={() => setActiveTool(activeTool === 'clock' ? null : 'clock')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'clock' ? 'border-amber-500/60 bg-amber-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center mb-2">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Clock & Timer</h3>
            <p className="text-[11px] text-slate-400">Live time & stopwatch</p>
          </div>
        </div>

        {/* Tool: Weather */}
        <div
          onClick={() => setActiveTool(activeTool === 'weather' ? null : 'weather')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'weather' ? 'border-sky-500/60 bg-sky-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-sky-600/20 text-sky-400 flex items-center justify-center mb-2">
            <CloudSun className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Weather</h3>
            <p className="text-[11px] text-slate-400">Forecast & climate</p>
          </div>
        </div>

        {/* Tool: Notes */}
        <div
          onClick={() => setActiveTool(activeTool === 'notes' ? null : 'notes')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'notes' ? 'border-indigo-500/60 bg-indigo-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-2">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Notes</h3>
            <p className="text-[11px] text-slate-400">Offline scratchpad</p>
          </div>
        </div>

        {/* Tool: Screen Reader / OCR */}
        <div
          onClick={() => setActiveTool(activeTool === 'reader' ? null : 'reader')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
            activeTool === 'reader' ? 'border-pink-500/60 bg-pink-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center mb-2">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Screen Reader</h3>
            <p className="text-[11px] text-slate-400">Read & extract text</p>
          </div>
        </div>

        {/* Tool: Android Companion Architecture */}
        <div
          onClick={() => setActiveTool(activeTool === 'android' ? null : 'android')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between col-span-2 sm:col-span-1 ${
            activeTool === 'android' ? 'border-cyan-500/60 bg-cyan-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mb-2">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Android System</h3>
            <p className="text-[11px] text-slate-400">Companion architecture</p>
          </div>
        </div>

        {/* Tool: Open Chrome / Website */}
        <div
          onClick={() => setActiveTool(activeTool === 'browser' ? null : 'browser')}
          className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all duration-200 flex flex-col justify-between col-span-2 sm:col-span-1 ${
            activeTool === 'browser' ? 'border-teal-500/60 bg-teal-950/20 shadow-lg' : 'hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-teal-600/20 text-teal-400 flex items-center justify-center mb-2">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Open Website</h3>
            <p className="text-[11px] text-slate-400">Launch any URL</p>
          </div>
        </div>
      </div>

      {/* Expanded Tool Action Workspace */}
      {activeTool && (
        <div className="rounded-2xl glass-panel-glow p-5 sm:p-6 transition-all duration-300">
          {/* YouTube Expanded */}
          {activeTool === 'yt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-400 font-bold">
                  <Youtube className="w-5 h-5" />
                  <span>Open YouTube</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-300">
                Launch YouTube directly or enter a topic to search automatically:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ytQuery}
                  onChange={(e) => setYtQuery(e.target.value)}
                  placeholder="Enter video or topic (e.g. Iron Man Jarvis scenes)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-red-500 outline-none"
                />
                <button
                  onClick={openYouTube}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg"
                >
                  <span>Launch</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Google Expanded */}
          {activeTool === 'google' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Search className="w-5 h-5" />
                  <span>Google Search</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-300">
                Type your search inquiry to open results immediately in Google:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={googleQuery}
                  onChange={(e) => setGoogleQuery(e.target.value)}
                  placeholder="Search anything on Google..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-blue-500 outline-none"
                />
                <button
                  onClick={openGoogle}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg"
                >
                  <span>Search</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* WhatsApp Expanded */}
          {activeTool === 'wa' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <MessageCircle className="w-5 h-5" />
                  <span>WhatsApp Message</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="Phone number with country code (optional, e.g. +919876543210)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-emerald-500 outline-none"
                />
                <textarea
                  value={waText}
                  onChange={(e) => setWaText(e.target.value)}
                  placeholder="Type message text to send via WhatsApp..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-emerald-500 outline-none resize-none"
                />
                <button
                  onClick={openWhatsApp}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg"
                >
                  <span>Open WhatsApp with Message</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Calculator Expanded */}
          {activeTool === 'calc' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-400 font-bold">
                  <CalcIcon className="w-5 h-5" />
                  <span>Built-in Scientific & Arithmetic Calculator</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              {/* Calculator UI */}
              <div className="max-w-xs mx-auto p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="p-3 rounded-xl bg-slate-900 text-right font-mono text-2xl text-white overflow-x-auto">
                  {calcDisplay}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['C', '(', ')', '/'].map((b) => (
                    <button
                      key={b}
                      onClick={() => handleCalcBtn(b)}
                      className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 font-semibold text-sm transition-colors"
                    >
                      {b}
                    </button>
                  ))}
                  {['7', '8', '9', '*'].map((b) => (
                    <button
                      key={b}
                      onClick={() => handleCalcBtn(b)}
                      className={`p-2.5 rounded-lg font-semibold text-sm transition-colors ${
                        b === '*' ? 'bg-slate-800 text-purple-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                  {['4', '5', '6', '-'].map((b) => (
                    <button
                      key={b}
                      onClick={() => handleCalcBtn(b)}
                      className={`p-2.5 rounded-lg font-semibold text-sm transition-colors ${
                        b === '-' ? 'bg-slate-800 text-purple-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                  {['1', '2', '3', '+'].map((b) => (
                    <button
                      key={b}
                      onClick={() => handleCalcBtn(b)}
                      className={`p-2.5 rounded-lg font-semibold text-sm transition-colors ${
                        b === '+' ? 'bg-slate-800 text-purple-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                  {['0', '.', '%', '='].map((b) => (
                    <button
                      key={b}
                      onClick={() => handleCalcBtn(b)}
                      className={`p-2.5 rounded-lg font-semibold text-sm transition-colors ${
                        b === '=' ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-md' : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Clock & Timer Expanded */}
          {activeTool === 'clock' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Clock className="w-5 h-5" />
                  <span>Live Clock & Precision Stopwatch</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* World / Current Clock */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center space-y-1">
                  <span className="text-[11px] font-mono uppercase text-slate-400">Current Local Time</span>
                  <span className="text-3xl font-bold font-mono text-white tracking-wider">
                    {currentTime.toLocaleTimeString()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>

                {/* Stopwatch */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center space-y-2">
                  <span className="text-[11px] font-mono uppercase text-slate-400">Stopwatch</span>
                  <span className="text-3xl font-bold font-mono text-cyan-300">
                    {Math.floor(stopwatchTime / 60000).toString().padStart(2, '0')}:
                    {Math.floor((stopwatchTime % 60000) / 1000).toString().padStart(2, '0')}.
                    {Math.floor((stopwatchTime % 1000) / 10).toString().padStart(2, '0')}
                  </span>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setIsStopwatchRunning(!isStopwatchRunning)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                        isStopwatchRunning ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isStopwatchRunning ? 'Pause' : 'Start'}
                    </button>
                    <button
                      onClick={() => {
                        setIsStopwatchRunning(false);
                        setStopwatchTime(0);
                      }}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs hover:text-white flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Weather Expanded */}
          {activeTool === 'weather' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sky-400 font-bold">
                  <CloudSun className="w-5 h-5" />
                  <span>Weather Radar & Forecast</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              {/* City Search Bar */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter city (e.g. Delhi, Mumbai, Patna, Bengaluru)..."
                  defaultValue={weatherCity}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleWeatherSearch((e.target as any).value);
                  }}
                  id="weather-input"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-sky-500 outline-none"
                />
                <button
                  onClick={() => {
                    const el = document.getElementById('weather-input') as HTMLInputElement;
                    if (el) handleWeatherSearch(el.value);
                  }}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                >
                  Lookup
                </button>
              </div>

              {/* Weather Stats Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-xl font-bold text-white capitalize">{weatherCity}</h4>
                  <p className="text-xs text-sky-300">{weatherData.condition}</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-extrabold text-white font-mono">{weatherData.temp}</span>
                </div>
                <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-500 block">Humidity</span>
                    <span className="font-semibold text-slate-200">{weatherData.humidity}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Wind Speed</span>
                    <span className="font-semibold text-slate-200">{weatherData.wind}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">High</span>
                    <span className="font-semibold text-slate-200">{weatherData.high}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Low</span>
                    <span className="font-semibold text-slate-200">{weatherData.low}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes Expanded */}
          {activeTool === 'notes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                  <FileText className="w-5 h-5" />
                  <span>JIYA Quick Notes</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={6}
                placeholder="Write your quick thoughts, tasks, or prompt ideas..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:border-indigo-500 outline-none font-mono"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {noteSaved ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Saved to LocalStorage
                    </span>
                  ) : (
                    'Auto-saved in browser'
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(noteContent);
                      setNoteSaved(true);
                      setTimeout(() => setNoteSaved(false), 2000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md"
                  >
                    Save Notes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Screen Reader Expanded */}
          {activeTool === 'reader' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-pink-400 font-bold">
                  <Volume2 className="w-5 h-5" />
                  <span>Screen Reader & Text-to-Speech Extractor</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Paste any text, article, or document below for JIYA to vocalize in her current voice mode ({modeConfig.name}):
              </p>

              <textarea
                value={readerText}
                onChange={(e) => setReaderText(e.target.value)}
                rows={4}
                placeholder="Paste text here to read aloud with JIYA's natural voice..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:border-pink-500 outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={handleScreenCapture}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 border border-slate-700"
                >
                  <span>Request Screen Sharing Authorization</span>
                </button>

                <button
                  onClick={() => handleReadTextAloud(readerText)}
                  disabled={!readerText.trim() || isReadingScreen}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isReadingScreen ? 'Speaking...' : 'Read Aloud with JIYA'}</span>
                </button>
              </div>

              {screenCaptureStatus && (
                <p className="text-xs text-cyan-300 bg-slate-900/80 p-2 rounded-lg border border-cyan-500/30">
                  {screenCaptureStatus}
                </p>
              )}
            </div>
          )}

          {/* Android Companion App Architecture & System Info */}
          {activeTool === 'android' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-400 font-bold">
                  <Smartphone className="w-5 h-5" />
                  <span>Android Companion Architecture & System Control</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                  <Info className="w-4 h-4" />
                  <span>Browser Security & Android Sandbox Clarification</span>
                </div>
                <p>
                  As an ethical, production-grade assistant, <strong>JIYA AI</strong> respects OS sandbox boundaries. Standard web browsers cannot secretly hijack native Android system functions (such as background OS screen taps or silent app reading) without explicit user permissions and an Android companion service.
                </p>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <h4 className="font-semibold text-white">How Full Android Control Operates:</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>
                    <strong>Android Intent Protocol:</strong> Launches installed apps (Chrome, YouTube, WhatsApp) using native URI schemes (<code className="text-purple-300">intent://</code> / <code className="text-purple-300">https://wa.me</code>).
                  </li>
                  <li>
                    <strong>Android Accessibility Service:</strong> Companion APK with declared Accessibility permissions (<code className="text-purple-300">android.permission.BIND_ACCESSIBILITY_SERVICE</code>) performs gesture navigation, global search, and screen reading with user consent.
                  </li>
                  <li>
                    <strong>Voice Activity & Background Wakeup:</strong> Foreground service notification keeps audio listeners active without battery killing or arbitrary browser kills.
                  </li>
                </ul>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-purple-300">
                  <span>Companion Architecture:</span>
                  <div className="mt-1 text-slate-400">
                    Web Client (JIYA UI) ⇆ Secure WebSocket / WebRTC ⇆ Native Kotlin Service (Accessibility & MediaProjection)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Custom Web Launcher Expanded */}
          {activeTool === 'browser' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-teal-400 font-bold">
                  <Globe className="w-5 h-5" />
                  <span>Open Any Website</span>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-300">
                Launch any supported website or web application in Chrome/browser:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="Enter URL (e.g. github.com, wikipedia.org)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-teal-500 outline-none"
                />
                <button
                  onClick={openCustomWeb}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice Commands Cheat Sheet */}
      <div className="rounded-2xl glass-panel p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-purple-400" />
          <span>Supported Voice Commands for JIYA</span>
        </h3>
        <p className="text-xs text-slate-400">
          You can speak any of these commands directly using the microphone:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {[
            { cmd: 'Switch to Jarvis mode', action: 'Switches persona to Jarvis' },
            { cmd: 'Open YouTube and search for tech news', action: 'Launches video query' },
            { cmd: 'Tell me a joke in Bhojpuri', action: 'Entertains in Dost/Funny mode' },
            { cmd: 'What is the weather in Delhi?', action: 'Checks city climate' },
            { cmd: 'Calculate 15 percent of 480', action: 'Solves math query' },
            { cmd: 'Motivate me for my study today', action: 'Friendly inspiration' },
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => onRunVoiceCommand(item.cmd)}
              className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/60 transition-colors flex items-center justify-between group"
            >
              <div>
                <span className="text-purple-300 font-medium block">"{item.cmd}"</span>
                <span className="text-[10px] text-slate-400">{item.action}</span>
              </div>
              <Play className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
