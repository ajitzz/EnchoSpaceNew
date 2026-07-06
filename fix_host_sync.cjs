const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

file = file.replace(
    `useEffect(() => {
    localStorage.setItem('hostPreviewListing', JSON.stringify(mockListing));
  }, [formData, photos, user]);

  const mockListing: Listing = {`,
    `const mockListing: Listing = {`
);

const target = `host_name: user?.name || 'You',
    host_avatar: user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=You'
  };`;

const replacement = `host_name: user?.name || 'You',
    host_avatar: user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=You'
  };

  useEffect(() => {
    localStorage.setItem('hostPreviewListing', JSON.stringify(mockListing));
  }, [mockListing]);`;

if (!file.includes('localStorage.setItem(\'hostPreviewListing\', JSON.stringify(mockListing));')) {
    file = file.replace(target, replacement);
    fs.writeFileSync('components/HostForm.tsx', file);
    console.log('HostForm fixed for sync');
} else {
    file = file.replace(
        "useEffect(() => {\n    localStorage.setItem('hostPreviewListing', JSON.stringify(mockListing));\n  }, [formData, photos, user]);\n\n  const mockListing: Listing = {",
        "const mockListing: Listing = {"
    );
    file = file.replace(target, replacement);
    fs.writeFileSync('components/HostForm.tsx', file);
    console.log('HostForm fixed for sync 2');
}
