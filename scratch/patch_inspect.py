import re

with open('components/ListingDetailsNew.tsx', 'r') as f:
    content = f.read()

# Fix the onClick for the big image in Cinematic section (which currently sets lightboxIndex)
# It's inside "RIGHT SIDE (5 Cols): LARGE FEATURE HERO VISTA"
pattern1 = r'onClick=\{\(\) => \{\n\s*uiAudio\.playClick\(\);\n\s*setLightboxIndex\(slideCollections\[activeSlide\]\.space01\.imgIndex\);\n\s*\}\}'
new1 = r'''onClick={() => {
                      uiAudio.playClick();
                      setGalleryInitialIndex(0);
                      setGalleryInitialCategory(slideCollections[activeSlide].id);
                      setIsGalleryOpen(true);
                    }}'''
content = re.sub(pattern1, new1, content)

# There's also an 'Inspect in 4K' button. Let's see if it has an onClick.
# It is just a div: <div className="flex items-center gap-1.5 text-xs font-bold font-display text-amber-300 group-hover:translate-x-1 transition-transform">
# Wait, the parent of 'Inspect in 4K' is actually the same image! The image has the `onClick`. 
# Wait, the button "Book This Space" stops propagation. So clicking "Inspect in 4K" will trigger the parent's `onClick`. This is perfect!

with open('components/ListingDetailsNew.tsx', 'w') as f:
    f.write(content)
print("Patched Inspect in 4K click handler")
