const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const target = `const mockListing: Listing = {`;
const replacement = `useEffect(() => {
    localStorage.setItem('hostPreviewListing', JSON.stringify(mockListing));
  }, [formData, photos, user]);

  const mockListing: Listing = {`;

if (!file.includes('localStorage.setItem(\'hostPreviewListing\'')) {
    file = file.replace(target, replacement);
    fs.writeFileSync('components/HostForm.tsx', file);
    console.log('HostForm patched for sync');
} else {
    // If it was already added somewhere else, let's just make sure we do it here.
    file = file.replace(
        "const mockListing: Listing = {", 
        `useEffect(() => {
    localStorage.setItem('hostPreviewListing', JSON.stringify(mockListing));
  }, [formData, photos, user]);

  const mockListing: Listing = {`
    );
    // actually, if it's already there, wait... 
}
