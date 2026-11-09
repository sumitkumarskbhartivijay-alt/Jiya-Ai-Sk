import React from 'react';
import { Home, Sparkles, MessageSquare, Wrench, Settings } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { PersonalityMode } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';

export type TabId = 'home' | 'modes' | 'chat' | 'tools' | 'settings' | 'diagnostics';

interface BottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  currentMode: PersonalityMode;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  currentMode,
}) => {
  const modeConfig = PERSONALITY_MODES[currentMode];

  const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'modes', label: 'Modes', icon: Sparkles },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 glass-panel border-t border-slate-800/80 max-w-lg mx-auto sm:rounded-t-2xl px-2">
      <div className="grid grid-cols-5 h-full items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] transition-all relative ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-label={tab.label}
            >
              {isActive && (
                <span
                  className="absolute top-1.5 w-6 h-1 rounded-full shadow-sm transition-all"
                  style={{ backgroundColor: modeConfig.accentColor }}
                />
              )}
              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? 'scale-110' : ''
                }`}
                style={isActive ? { color: modeConfig.accentColor } : {}}
              />
              <span
                className={`text-[10px] font-medium tracking-tight mt-1 ${
                  isActive ? 'text-white font-semibold' : ''
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
