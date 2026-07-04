const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const oldBottomNav = `<BottomNav 
        currentView={currentView}
        appMode={appMode}
        onNavigate={setCurrentView}
        onProfileClick={() => setShowProfileSheet(true)}
      />`;

const newBottomNav = `{currentView !== 'DETAILS' && currentView !== 'EXPERIENCE_DETAILS' && (
        <BottomNav 
          currentView={currentView}
          appMode={appMode}
          onNavigate={setCurrentView}
          onProfileClick={() => setShowProfileSheet(true)}
        />
      )}`;

code = code.replace(oldBottomNav, newBottomNav);
fs.writeFileSync('App.tsx', code);
