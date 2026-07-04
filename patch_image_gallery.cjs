const fs = require('fs');
let code = fs.readFileSync('components/ImageGallery.tsx', 'utf8');

// I'll rewrite the motion.div for the image viewer to support vertical swipe-to-dismiss and scale-down
const oldMainImage = `          {/* Main Image Viewer */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden w-full h-full group" onClick={onClose}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, { offset }) => {
                  const swipe = offset.x;
                  if (swipe < -50 && currentIndex < images.length - 1) {
                    setCurrentIndex((prev) => prev + 1);
                  } else if (swipe > 50 && currentIndex > 0) {
                    setCurrentIndex((prev) => prev - 1);
                  }
                }}
                className="w-full h-full flex items-center justify-center p-4 md:p-12 cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()} // Prevent close on clicking image
              >
                <OptimizedImage
                  src={images[currentIndex]}
                  alt={\`Gallery image \${currentIndex + 1}\`}
                  className="max-w-full max-h-full object-contain select-none shadow-2xl rounded-sm pointer-events-none"
                />
              </motion.div>
            </AnimatePresence>`;

const newMainImage = `          {/* Main Image Viewer */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden w-full h-full group" onClick={onClose}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 35, stiffness: 350, mass: 0.8 }}
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={1}
                whileDrag={{ scale: 0.9 }}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipeX = offset.x;
                  const swipeY = offset.y;
                  
                  // Vertical swipe to dismiss
                  if (Math.abs(swipeY) > 100 || Math.abs(velocity.y) > 500) {
                    onClose();
                    return;
                  }
                  
                  // Horizontal swipe
                  if (swipeX < -50 && currentIndex < images.length - 1) {
                    setCurrentIndex((prev) => prev + 1);
                    if(window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
                  } else if (swipeX > 50 && currentIndex > 0) {
                    setCurrentIndex((prev) => prev - 1);
                    if(window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
                  }
                }}
                className="w-full h-full flex items-center justify-center p-4 md:p-12 cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()} // Prevent close on clicking image
              >
                <OptimizedImage
                  src={images[currentIndex]}
                  alt={\`Gallery image \${currentIndex + 1}\`}
                  className="max-w-full max-h-full object-contain select-none shadow-2xl rounded-[20px] pointer-events-none bg-black/50"
                />
              </motion.div>
            </AnimatePresence>`;

code = code.replace(oldMainImage, newMainImage);

// Also change the initial mount animation
code = code.replace(
    `initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}`,
    `initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}`
);

fs.writeFileSync('components/ImageGallery.tsx', code);
