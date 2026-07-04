const fs = require('fs');
let code = fs.readFileSync('components/AuthModal.tsx', 'utf8');

// Ensure motion is imported
if (!code.includes('import { motion, AnimatePresence } from \'framer-motion\';')) {
    code = code.replace(`import React, { useState } from 'react';`, `import React, { useState } from 'react';\nimport { motion, AnimatePresence, useDragControls } from 'framer-motion';`);
}

// Replace the main modal wrapper with a native bottom sheet design
const oldWrapper = `<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>`;
const newWrapper = `
    const dragControls = useDragControls();

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[999] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
                <motion.div 
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    drag="y"
                    dragControls={dragControls}
                    dragListener={false}
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0, bottom: 1 }}
                    onDragEnd={(e, info) => {
                        if (info.offset.y > 100 || info.velocity.y > 500) {
                            onClose();
                        }
                    }}
                    className="bg-white w-full md:max-w-md rounded-t-[32px] md:rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Drag Handle (Mobile only) */}
                    <div 
                        className="w-full flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing touch-none"
                        onPointerDown={(e) => dragControls.start(e)}
                    >
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                    </div>`;

if (!code.includes('dragControls = useDragControls()')) {
    code = code.replace(`return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>`, newWrapper);
    
    // Close the tags properly at the end
    // The old code had: `</div>\n    </div>\n  );\n};`
    // We need to close AnimatePresence
    code = code.replace(/<\/div>\s*<\/div>\s*\);\s*};/g, `</motion.div>\n            </div>\n        </AnimatePresence>\n    );\n};`);
    
    // Fix inner styling
    code = code.replace(`<div className="bg-white w-full max-w-md rounded-2xl shadow-xl relative" onClick={e => e.stopPropagation()}>`, ` `); // Remove old inner div wrapper
}

fs.writeFileSync('components/AuthModal.tsx', code);
