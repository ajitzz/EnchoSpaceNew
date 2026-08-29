import re

with open('components/audio.ts', 'r') as f:
    content = f.read()

pattern = r'private playTone\(freq: number, type: OscillatorType, duration: number, vol: number = 0\.1\) \{\n\s*if \(!this\.enabled\) return;\n\s*this\.init\(\);'
new_code = """private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (!this.enabled) return;
    
    // Suppress AudioContext warning if user hasn't interacted yet
    if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
       if (!(navigator as any).userActivation.hasBeenActive) return;
    }
    
    this.init();"""

content = re.sub(pattern, new_code, content)

with open('components/audio.ts', 'w') as f:
    f.write(content)
print("Patched audio.ts")
