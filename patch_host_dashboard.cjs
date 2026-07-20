const fs = require('fs');
const file = 'components/HostDashboard.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes("socket.io-client")) {
  code = "import { io } from 'socket.io-client';\n" + code;
  
  // Find where useEffect is used to fetch data and add socket listener
  const useEffectMatch = code.match(/useEffect\(\(\) => \{[\s\S]*?fetchDashboardData\(\);[\s\S]*?\}, \[user\]\);/);
  
  if (useEffectMatch) {
    const replacement = `useEffect(() => {
    fetchDashboardData();
    
    // 10/10 Industrial Standard: Real-Time Dopamine UI Socket
    const socket = io();
    if (user?.id) {
      socket.emit('join_user', user.id);
    }
    
    socket.on('db_changed', (data: any) => {
      if (data && (data.type === 'marketing' || data.type === 'listing' || data.type === 'booking')) {
        console.log(\`[REALTIME] Received \${data.type} event. Refreshing Host Dashboard...\`);
        fetchDashboardData();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);`;
    
    code = code.replace(useEffectMatch[0], replacement);
    fs.writeFileSync(file, code);
    console.log("Patched HostDashboard with Socket.io");
  } else {
    console.log("Could not find useEffect to patch");
  }
}
