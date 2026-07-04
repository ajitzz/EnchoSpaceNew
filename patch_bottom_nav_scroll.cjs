const fs = require('fs');
let code = fs.readFileSync('components/BottomNav.tsx', 'utf8');

const importTarget = `import { motion } from 'framer-motion';`;
const importReplacement = `import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';`;
if (!code.includes('useScroll')) {
    code = code.replace(importTarget, importReplacement);
}

const componentStartTarget = `export const BottomNav: React.FC<BottomNavProps> = ({ currentView, appMode, onNavigate, onProfileClick }) => {`;
const componentStartReplacement = `export const BottomNav: React.FC<BottomNavProps> = ({ currentView, appMode, onNavigate, onProfileClick }) => {
  const [isVisible, setIsVisible] = React.useState(true);
  const { scrollY } = useScroll();
  const lastY = React.useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest < 0) return; // iOS bounce effect
    if (latest > lastY.current + 10) {
      setIsVisible(false); // scrolling down
    } else if (latest < lastY.current - 10 || latest < 50) {
      setIsVisible(true); // scrolling up
    }
    lastY.current = latest;
  });`;

if (!code.includes('isVisible')) {
    code = code.replace(componentStartTarget, componentStartReplacement);
}

const returnTarget = `return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-100/50 pb-safe z-[200]">`;
const returnReplacement = `return (
    <AnimatePresence>
    {isVisible && (
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl saturate-150 border-t border-gray-100/50 pb-safe z-[200]"
      >`;
if (!code.includes('<AnimatePresence>')) {
    code = code.replace(returnTarget, returnReplacement);
    
    // Replace the final closing div and add AnimatePresence
    const endTarget = `      </div>\n    </div>\n  );\n};`;
    const endReplacement = `      </div>\n      </motion.div>\n    )}\n    </AnimatePresence>\n  );\n};`;
    code = code.replace(endTarget, endReplacement);
}

fs.writeFileSync('components/BottomNav.tsx', code);
