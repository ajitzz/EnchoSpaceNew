import re

with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    content = f.read()

pattern = r'const \[isStoryDrawerOpen, setIsStoryDrawerOpen\] = useState\(true\);'
new_code = """const [isStoryDrawerOpen, setIsStoryDrawerOpen] = useState(true);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialCategory) setSelectedCategory(initialCategory as GalleryCategoryKey);
      if (initialIndex !== undefined) setLightboxIndex(initialIndex);
    }
  }, [isOpen, initialCategory, initialIndex]);"""

content = re.sub(pattern, new_code, content)

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.write(content)
print("Patched gallery sync")
