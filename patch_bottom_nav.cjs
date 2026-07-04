const fs = require('fs');
const code = fs.readFileSync('components/BottomNav.tsx', 'utf8');

const updated = code.replace(
`export const BottomNav: React.FC<BottomNavProps> = ({ currentView, appMode, onNavigate, onProfileClick, unreadCount = 0 }) => {
  const { user } = useAuth();
  const { addToast } = useToast();`,
`export const BottomNav: React.FC<BottomNavProps> = ({ currentView, appMode, onNavigate, onProfileClick }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
     if (user) {
         fetch('/api/unread-counts', {
             headers: { 'Authorization': \`Bearer \${localStorage.getItem('token')}\` }
         })
         .then(res => res.json())
         .then(data => setUnreadCount(data.unread || 0))
         .catch(console.error);
         
         const interval = setInterval(() => {
             fetch('/api/unread-counts', {
                 headers: { 'Authorization': \`Bearer \${localStorage.getItem('token')}\` }
             })
             .then(res => res.json())
             .then(data => setUnreadCount(data.unread || 0));
         }, 30000);
         return () => clearInterval(interval);
     } else {
         setUnreadCount(0);
     }
  }, [user]);`
);

fs.writeFileSync('components/BottomNav.tsx', updated);
