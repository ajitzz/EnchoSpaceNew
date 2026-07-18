import subprocess
import time
import urllib.request

print("Starting server...")
proc = subprocess.Popen(["npm", "run", "start"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

time.sleep(5)
# See what happened
if proc.poll() is not None:
    print("Server died early.")
    out, _ = proc.communicate()
    print(out.decode())
else:
    print("Server is still running. Testing connection...")
    try:
        urllib.request.urlopen("http://localhost:3000/api/health", timeout=3)
        print("Health check passed.")
    except Exception as e:
        print("Health check failed:", e)
    
    proc.terminate()
    print("Server terminated.")
